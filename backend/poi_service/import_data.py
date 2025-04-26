import os
import sys
import pandas as pd
import argparse
import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import traceback
import requests
import time
from datetime import datetime

# 添加当前目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 加载环境变量
load_dotenv()

# 导入应用模型和CRUD操作
from app.models import Base, User, POI, POIExtension, UserRole
from app.database import get_db
from app.security import get_password_hash
from app.config import settings

# 创建管理员用户（如果不存在）
def create_admin_user(db):
    # 检查admin用户是否存在
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        # 创建管理员用户
        admin_user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN
        )
        db.add(admin_user)
        db.commit()
        print("创建管理员用户成功")
        return admin_user
    return admin

# 使用高德地图API进行逆地理编码（获取省份和城市）
async def reverse_geocode(longitude, latitude, gaode_api_key):
    url = f"https://restapi.amap.com/v3/geocode/regeo"
    params = {
        "key": gaode_api_key,
        "location": f"{longitude},{latitude}",
        "extensions": "base",
        "output": "json"
    }
    
    try:
        response = requests.get(url, params=params)
        data = response.json()
        
        if data.get("status") == "1" and "regeocode" in data:
            address_component = data["regeocode"]["addressComponent"]
            province = address_component.get("province", "")
            city = address_component.get("city", "")
            if isinstance(city, list) and len(city) == 0:
                # 直辖市可能返回空列表
                city = province
            return province, city
    except Exception as e:
        print(f"地理编码API调用失败: {str(e)}")
    
    return None, None

# 处理CSV文件并导入数据库
async def process_csv(file_path, db, batch_size=100, admin_user=None):
    print(f"开始处理CSV文件: {file_path}")
    
    # 读取CSV文件
    try:
        df = pd.read_csv(file_path, encoding='utf-8')
    except UnicodeDecodeError:
        # 尝试其他编码
        try:
            df = pd.read_csv(file_path, encoding='gbk')
        except Exception as e:
            print(f"无法读取CSV文件: {str(e)}")
            return
    
    # 检查必要的列
    required_columns = ['景区名称', '经度BD_wgs84', '纬度BD_wgs84']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"CSV文件缺少必要的列: {', '.join(missing_columns)}")
        return
    
    # 重命名列以匹配模型属性
    column_mapping = {
        '景区名称': 'name',
        '地区': 'province',
        '景区等级': 'level',
        '经度BD_wgs84': 'longitude',
        '纬度BD_wgs84': 'latitude'
    }
    
    # 仅重命名存在的列
    df_renamed_columns = {}
    for old_col, new_col in column_mapping.items():
        if old_col in df.columns:
            df_renamed_columns[old_col] = new_col
    
    # 应用重命名
    df = df.rename(columns=df_renamed_columns)
    
    # 统计创建和更新的记录数
    created_count = 0
    updated_count = 0
    error_count = 0
    total_count = len(df)
    
    # 获取高德API密钥
    gaode_api_key = os.getenv("GAODE_API_KEY", "")
    api_call_count = 0
    api_call_limit = 500  # 高德API每天有调用次数限制
    
    # 批量处理数据
    print(f"总计 {total_count} 条记录，批量大小: {batch_size}")
    
    for i in range(0, total_count, batch_size):
        batch_df = df.iloc[i:i+batch_size]
        print(f"处理批次 {i//batch_size + 1}/{(total_count+batch_size-1)//batch_size}, 记录 {i+1}-{min(i+batch_size, total_count)}")
        
        for _, row in batch_df.iterrows():
            try:
                # 提取POI基本数据
                poi_data = {
                    'name': row.get('name'),
                    'province': row.get('province', ''),
                    'city': row.get('city', ''),
                    'category': row.get('category', ''),
                    'level': row.get('level', ''),
                    'longitude': float(row.get('longitude')),
                    'latitude': float(row.get('latitude')),
                    'description': row.get('description', ''),
                    'address': row.get('address', ''),
                    'created_by': admin_user.id if admin_user else None
                }
                
                # 如果省份或城市信息缺失，使用高德API补充
                if (not poi_data['province'] or not poi_data['city']) and api_call_count < api_call_limit:
                    province, city = await reverse_geocode(
                        poi_data['longitude'], 
                        poi_data['latitude'],
                        gaode_api_key
                    )
                    api_call_count += 1
                    
                    if province:
                        poi_data['province'] = province
                    if city:
                        poi_data['city'] = city
                
                # 检查是否已存在相同名称和位置的POI
                existing_poi = db.query(POI).filter(
                    POI.name == poi_data['name'],
                    POI.longitude == poi_data['longitude'],
                    POI.latitude == poi_data['latitude']
                ).first()
                
                if existing_poi:
                    # 更新现有POI
                    for key, value in poi_data.items():
                        if value is not None and value != '':
                            setattr(existing_poi, key, value)
                    
                    # 提取扩展信息数据
                    extension_data = {
                        'image_url': row.get('image_url', None),
                        'website': row.get('website', None),
                        'phone': row.get('phone', None),
                        'opening_hours': row.get('opening_hours', None),
                        'ticket_info': row.get('ticket_info', None)
                    }
                    
                    # 更新或创建扩展信息
                    if extension_data and any(v is not None and v != '' for v in extension_data.values()):
                        if existing_poi.extensions and len(existing_poi.extensions) > 0:
                            # 更新现有扩展信息
                            ext = existing_poi.extensions[0]
                            for key, value in extension_data.items():
                                if value is not None and value != '':
                                    setattr(ext, key, value)
                        else:
                            # 创建新的扩展信息
                            ext = POIExtension(**extension_data)
                            ext.poi = existing_poi
                            db.add(ext)
                    
                    updated_count += 1
                else:
                    # 创建新POI
                    new_poi = POI(**poi_data)
                    db.add(new_poi)
                    db.flush()  # 获取新创建的POI ID
                    
                    # 提取扩展信息数据
                    extension_data = {
                        'image_url': row.get('image_url', None),
                        'website': row.get('website', None),
                        'phone': row.get('phone', None),
                        'opening_hours': row.get('opening_hours', None),
                        'ticket_info': row.get('ticket_info', None)
                    }
                    
                    # 创建扩展信息
                    if extension_data and any(v is not None and v != '' for v in extension_data.values()):
                        ext = POIExtension(**extension_data)
                        ext.poi = new_poi
                        db.add(ext)
                    
                    created_count += 1
                
            except Exception as e:
                error_count += 1
                print(f"处理记录时出现未知错误: {str(e)}")
                traceback.print_exc()
        
        # 每批次提交一次事务
        try:
            db.commit()
            print(f"批次 {i//batch_size + 1} 提交成功，已处理 {min(i+batch_size, total_count)} / {total_count} 条记录")
        except Exception as e:
            db.rollback()
            print(f"批次 {i//batch_size + 1} 提交失败: {str(e)}")
            traceback.print_exc()
        
        # 检查API调用次数
        if api_call_count >= api_call_limit:
            print(f"已达到高德API调用限制 ({api_call_limit} 次调用)，跳过后续地理信息补充")
    
    print(f"\n数据导入完成:")
    print(f"总记录数: {total_count}")
    print(f"成功创建: {created_count}")
    print(f"成功更新: {updated_count}")
    print(f"处理错误: {error_count}")
    return created_count, updated_count, error_count

async def main():
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="导入POI数据从CSV文件")
    parser.add_argument("csv_file", help="CSV文件路径")
    parser.add_argument("--batch-size", type=int, default=100, help="批处理大小 (默认: 100)")
    args = parser.parse_args()
    
    # 连接数据库
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        db_url = settings.SQLALCHEMY_DATABASE_URI
    
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # 创建admin用户（如果不存在）
        admin = create_admin_user(db)
        
        # 处理CSV文件
        await process_csv(args.csv_file, db, args.batch_size, admin)
    
    finally:
        # 关闭数据库会话
        db.close()
        print("数据库会话已关闭")

if __name__ == "__main__":
    asyncio.run(main())