#!/usr/bin/env python
# 检查POI数据库中是否存在重复记录

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.models import POI
from app.config import settings

# 创建数据库连接
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

# 查询名称重复的POI
print('===== 查询重名POI结果 =====')
duplicate_names = db.query(POI.name, func.count(POI.name)).group_by(POI.name).having(func.count(POI.name) > 1).all()

if duplicate_names:
    print('发现重名POI:')
    for name, count in duplicate_names:
        print(f'名称: {name}, 重复次数: {count}')
        # 查询详细信息
        duplicates = db.query(POI).filter(POI.name == name).all()
        for poi in duplicates:
            print(f'  ID: {poi.id}, 省份: {poi.province}, 经度: {poi.longitude}, 纬度: {poi.latitude}, 创建时间: {poi.created_at}')
else:
    print('数据库中没有发现重名的POI')

# 查询坐标完全相同的POI
print('\n===== 查询重复坐标POI结果 =====')
duplicate_coords = db.query(
    POI.longitude, POI.latitude, func.count('*')
).group_by(
    POI.longitude, POI.latitude
).having(
    func.count('*') > 1
).all()

if duplicate_coords:
    print('发现坐标相同的POI:')
    for lng, lat, count in duplicate_coords:
        print(f'坐标: ({lng}, {lat}), 重复次数: {count}')
        # 查询详细信息
        duplicates = db.query(POI).filter(POI.longitude == lng, POI.latitude == lat).all()
        for poi in duplicates:
            print(f'  ID: {poi.id}, 名称: {poi.name}, 省份: {poi.province}, 创建时间: {poi.created_at}')
else:
    print('数据库中没有发现坐标完全相同的POI')

# 查询名称相似度很高的POI（可能是拼写错误或者别名）
print('\n===== 查询相似名称的POI =====')
print('注: 这需要数据库支持模糊匹配，以下仅检查简单的包含关系')

all_pois = db.query(POI.id, POI.name).all()
poi_map = {poi_id: name for poi_id, name in all_pois}
potential_duplicates = set()

for id1, name1 in all_pois:
    for id2, name2 in all_pois:
        if id1 >= id2:  # 避免重复比较
            continue
        
        # 检查名称是否有包含关系
        if name1 in name2 or name2 in name1:
            if len(name1) > 2 and len(name2) > 2:  # 忽略太短的名称
                potential_duplicates.add((id1, id2))

if potential_duplicates:
    print(f'发现 {len(potential_duplicates)} 对可能相似的POI名称:')
    for id1, id2 in list(potential_duplicates)[:20]:  # 限制显示数量
        print(f'  POI 1: ID={id1}, 名称="{poi_map[id1]}"')
        print(f'  POI 2: ID={id2}, 名称="{poi_map[id2]}"')
        print('')
    
    if len(potential_duplicates) > 20:
        print(f'... 还有 {len(potential_duplicates) - 20} 对未显示')
else:
    print('没有发现明显相似的POI名称')

db.close()
print('\n分析完成。') 