#!/usr/bin/env python
# 自动清理POI数据库中的重复记录

import os
import json
import datetime
from sqlalchemy import create_engine, func, desc, case, exists, select
from sqlalchemy.orm import sessionmaker, aliased
from app.models import POI, POIExtension, Base
from app.config import settings
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("deduplicate_pois.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger()

# 创建备份目录
BACKUP_DIR = "backups"
os.makedirs(BACKUP_DIR, exist_ok=True)

# 创建数据库连接
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def backup_poi(poi):
    """将POI对象转换为JSON并保存到备份文件"""
    backup_data = {
        "id": poi.id,
        "name": poi.name,
        "province": poi.province,
        "city": poi.city,
        "longitude": float(poi.longitude),
        "latitude": float(poi.latitude),
        "category": poi.category,
        "level": poi.level,
        "description": poi.description,
        "address": poi.address,
        "created_at": poi.created_at.isoformat() if poi.created_at else None,
        "updated_at": poi.updated_at.isoformat() if poi.updated_at else None,
        "created_by": poi.created_by
    }
    
    # 备份扩展信息
    extensions = []
    if poi.extensions:
        for ext in poi.extensions:
            extensions.append({
                "id": ext.id,
                "image_url": ext.image_url,
                "website": ext.website,
                "phone": ext.phone,
                "opening_hours": ext.opening_hours,
                "ticket_info": ext.ticket_info
            })
    
    backup_data["extensions"] = extensions
    return backup_data

def deduplicate_by_coordinates():
    """清理坐标完全相同的POI记录"""
    logger.info("开始清理坐标重复的POI")
    
    # 查询坐标重复的POI
    duplicate_coords = db.query(
        POI.longitude, POI.latitude, func.count('*')
    ).group_by(
        POI.longitude, POI.latitude
    ).having(
        func.count('*') > 1
    ).all()
    
    if not duplicate_coords:
        logger.info("未发现坐标重复的POI")
        return []
    
    logger.info(f"发现 {len(duplicate_coords)} 组坐标重复的POI")
    removed_pois = []
    
    for lng, lat, count in duplicate_coords:
        logger.info(f"处理坐标 ({lng}, {lat}) 的 {count} 个重复POI")
        
        # 查询同一坐标的所有POI
        # 根据是否存在扩展信息、更新时间和创建时间排序
        duplicates = db.query(POI).outerjoin(POIExtension).filter(
            POI.longitude == lng, 
            POI.latitude == lat
        ).group_by(POI.id).order_by(
            desc(func.count(POIExtension.id)),  # 优先保留有扩展信息的记录
            desc(POI.updated_at),               # 其次保留最新更新的记录
            desc(POI.created_at)                # 最后考虑创建时间
        ).all()
        
        if not duplicates:
            logger.warning(f"未找到坐标为 ({lng}, {lat}) 的POI记录，可能已经被其他程序修改")
            continue
            
        # 保留第一条记录，删除其余记录
        keep_poi = duplicates[0]
        has_extensions = len(keep_poi.extensions) > 0
        logger.info(f"保留ID={keep_poi.id}, 名称={keep_poi.name}, 有扩展信息={has_extensions} 的记录")
        
        for poi in duplicates[1:]:
            poi_extensions = len(poi.extensions) > 0
            logger.info(f"删除ID={poi.id}, 名称={poi.name}, 有扩展信息={poi_extensions} 的记录")
            removed_pois.append(backup_poi(poi))
            db.delete(poi)
    
    try:
        db.commit()
        logger.info(f"坐标去重完成，共删除 {len(removed_pois)} 条记录")
    except Exception as e:
        db.rollback()
        logger.error(f"坐标去重失败: {str(e)}")
    
    return removed_pois

def deduplicate_by_name():
    """清理名称完全相同的POI记录"""
    logger.info("开始清理名称重复的POI")
    
    # 查询名称重复的POI
    duplicate_names = db.query(
        POI.name, func.count(POI.name)
    ).group_by(
        POI.name
    ).having(
        func.count(POI.name) > 1
    ).all()
    
    if not duplicate_names:
        logger.info("未发现名称重复的POI")
        return []
    
    logger.info(f"发现 {len(duplicate_names)} 组名称重复的POI")
    removed_pois = []
    
    for name, count in duplicate_names:
        logger.info(f"处理名称 '{name}' 的 {count} 个重复POI")
        
        # 查询同名的所有POI
        # 根据是否存在扩展信息、更新时间和创建时间排序
        duplicates = db.query(POI).outerjoin(POIExtension).filter(
            POI.name == name
        ).group_by(POI.id).order_by(
            desc(func.count(POIExtension.id)),
            desc(POI.updated_at),
            desc(POI.created_at)
        ).all()
        
        if not duplicates:
            logger.warning(f"未找到名称为 '{name}' 的POI记录，可能已经被其他程序修改")
            continue
            
        # 保留第一条记录，删除其余记录
        keep_poi = duplicates[0]
        has_extensions = len(keep_poi.extensions) > 0
        logger.info(f"保留ID={keep_poi.id}, 坐标=({keep_poi.longitude}, {keep_poi.latitude}), 有扩展信息={has_extensions} 的记录")
        
        for poi in duplicates[1:]:
            # 如果坐标不同，可能是不同地点的同名POI，应当保留
            if poi.longitude != keep_poi.longitude or poi.latitude != keep_poi.latitude:
                coord_diff = ((float(poi.longitude) - float(keep_poi.longitude))**2 + 
                              (float(poi.latitude) - float(keep_poi.latitude))**2)**0.5
                
                # 如果坐标差异很小（比如小于0.001度），可以认为是同一个地点的重复记录
                if coord_diff < 0.001:
                    poi_extensions = len(poi.extensions) > 0
                    logger.info(f"删除ID={poi.id}, 坐标=({poi.longitude}, {poi.latitude}), 有扩展信息={poi_extensions} 的记录，与保留记录坐标差异为 {coord_diff}")
                    removed_pois.append(backup_poi(poi))
                    db.delete(poi)
                else:
                    logger.info(f"保留ID={poi.id} 的记录，虽然名称相同但坐标差异为 {coord_diff}，可能是不同地点")
            else:
                # 坐标完全相同，删除
                poi_extensions = len(poi.extensions) > 0
                logger.info(f"删除ID={poi.id}, 有扩展信息={poi_extensions} 的记录，名称和坐标都相同")
                removed_pois.append(backup_poi(poi))
                db.delete(poi)
    
    try:
        db.commit()
        logger.info(f"名称去重完成，共删除 {len(removed_pois)} 条记录")
    except Exception as e:
        db.rollback()
        logger.error(f"名称去重失败: {str(e)}")
    
    return removed_pois

def save_backup(removed_pois):
    """保存删除的POI记录到备份文件"""
    if not removed_pois:
        return
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"removed_pois_{timestamp}.json")
    
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(removed_pois, f, ensure_ascii=False, indent=2)
    
    logger.info(f"已将删除的 {len(removed_pois)} 条记录备份到 {backup_file}")

def restore_from_backup(backup_file):
    """从备份文件恢复删除的POI记录"""
    if not os.path.exists(backup_file):
        logger.error(f"备份文件 {backup_file} 不存在")
        return
    
    with open(backup_file, "r", encoding="utf-8") as f:
        backup_data = json.load(f)
    
    logger.info(f"从备份文件 {backup_file} 中恢复 {len(backup_data)} 条记录")
    
    for poi_data in backup_data:
        # 检查记录是否已存在
        existing_poi = db.query(POI).filter(POI.id == poi_data["id"]).first()
        if existing_poi:
            logger.warning(f"ID={poi_data['id']} 的记录已存在，跳过恢复")
            continue
        
        # 创建新的POI记录
        poi = POI(
            id=poi_data["id"],
            name=poi_data["name"],
            province=poi_data["province"],
            city=poi_data["city"],
            longitude=poi_data["longitude"],
            latitude=poi_data["latitude"],
            category=poi_data["category"],
            level=poi_data["level"],
            description=poi_data["description"],
            address=poi_data["address"],
            created_by=poi_data["created_by"]
        )
        
        # 设置时间戳
        if poi_data["created_at"]:
            poi.created_at = datetime.datetime.fromisoformat(poi_data["created_at"])
        if poi_data["updated_at"]:
            poi.updated_at = datetime.datetime.fromisoformat(poi_data["updated_at"])
        
        db.add(poi)
        
        # 恢复扩展信息
        if "extensions" in poi_data and poi_data["extensions"]:
            for ext_data in poi_data["extensions"]:
                extension = POIExtension(
                    poi_id=poi.id,
                    image_url=ext_data.get("image_url"),
                    website=ext_data.get("website"),
                    phone=ext_data.get("phone"),
                    opening_hours=ext_data.get("opening_hours"),
                    ticket_info=ext_data.get("ticket_info")
                )
                db.add(extension)
    
    try:
        db.commit()
        logger.info("恢复完成")
    except Exception as e:
        db.rollback()
        logger.error(f"恢复失败: {str(e)}")

def main():
    """执行完整的去重流程"""
    logger.info("开始POI数据库去重过程")
    
    try:
        # 备份所有将要删除的POI
        removed_by_coords = deduplicate_by_coordinates()
        removed_by_name = deduplicate_by_name()
        
        all_removed = removed_by_coords + removed_by_name
        if all_removed:
            save_backup(all_removed)
            logger.info(f"去重过程完成，共删除 {len(all_removed)} 条重复记录")
        else:
            logger.info("未发现需要删除的重复记录")
    except Exception as e:
        logger.error(f"去重过程发生错误: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    main() 