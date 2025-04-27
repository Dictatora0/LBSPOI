# 数据库操作封装

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app import models
from datetime import datetime
import uuid
from typing import List, Optional, Dict, Any, Union
from sqlalchemy import func, and_, or_, text
from app import schemas
from app.security import get_password_hash
from app.errors import APIError, ErrorCode

# 用户相关操作
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, role: models.UserRole = models.UserRole.PUBLIC):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    update_data = user_update.dict(exclude_unset=True)
    
    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
    
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    return db_user

# API密钥相关操作
def create_api_key(db: Session, user_id: int, rate_limit: int = 100):
    # 生成随机的API密钥
    api_key = uuid.uuid4().hex
    db_api_key = models.APIKey(
        key=api_key,
        user_id=user_id,
        rate_limit=rate_limit
    )
    db.add(db_api_key)
    db.commit()
    db.refresh(db_api_key)
    return db_api_key

def get_api_key(db: Session, key: str):
    return db.query(models.APIKey).filter(models.APIKey.key == key).first()

def get_user_api_keys(db: Session, user_id: int):
    return db.query(models.APIKey).filter(models.APIKey.user_id == user_id).all()

def deactivate_api_key(db: Session, key: str):
    db_api_key = get_api_key(db, key)
    if db_api_key:
        db_api_key.is_active = False
        db.commit()
        return True
    return False

# 请求日志相关操作
def log_request(db: Session, user_id: Optional[int], api_key: Optional[str], 
                endpoint: str, method: str, status_code: int, ip_address: Optional[str] = None):
    log_entry = models.RequestLog(
        user_id=user_id,
        api_key=api_key,
        endpoint=endpoint,
        method=method,
        status_code=status_code,
        ip_address=ip_address
    )
    db.add(log_entry)
    db.commit()
    return log_entry

def count_requests_by_api_key(db: Session, api_key: str, since: datetime):
    return db.query(models.RequestLog).filter(
        models.RequestLog.api_key == api_key,
        models.RequestLog.timestamp >= since
    ).count()

# POI相关操作
def get_poi(db: Session, poi_id: int) -> Optional[models.POI]:
    """获取单个POI"""
    try:
        return db.query(models.POI).filter(models.POI.id == poi_id).first()
    except SQLAlchemyError as e:
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="数据库查询错误",
            details={"error": str(e)}
        )

def get_poi_by_name(db: Session, name: str):
    return db.query(models.POI).filter(models.POI.name == name).first()

def get_pois(
    db: Session,
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    has_extension: Optional[bool] = None,
    offset: int = 0,
    limit: int = 10
) -> Dict[str, Union[List[models.POI], int]]:
    """获取POI列表"""
    try:
        query = db.query(models.POI)
        
        # 应用过滤条件
        if province:
            query = query.filter(models.POI.province == province)
        if city:
            query = query.filter(models.POI.city == city)
        if category:
            query = query.filter(models.POI.category == category)
        if level:
            query = query.filter(models.POI.level == level)
        if has_extension is not None:
            if has_extension:
                query = query.filter(models.POI.extensions.any())
            else:
                query = query.filter(~models.POI.extensions.any())
        
        # 获取总数
        total = query.count()
        
        # 应用分页
        items = query.offset(offset).limit(limit).all()
        
        return {"items": items, "total": total}
    except SQLAlchemyError as e:
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="数据库查询错误",
            details={"error": str(e)}
        )

def search_pois_by_name(db: Session, name_query: str, offset: int = 0, limit: int = 10):
    search_pattern = f"%{name_query}%"
    query = db.query(models.POI).filter(models.POI.name.like(search_pattern))
    
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def get_pois_in_bounding_box(
    db: Session, 
    min_lng: float, 
    min_lat: float, 
    max_lng: float, 
    max_lat: float, 
    q: Optional[str] = None,
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    offset: int = 0, 
    limit: int = 100
):
    query = db.query(models.POI).filter(
        models.POI.longitude >= min_lng,
        models.POI.longitude <= max_lng,
        models.POI.latitude >= min_lat,
        models.POI.latitude <= max_lat
    )
    
    # 添加搜索条件
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(models.POI.name.like(search_pattern))
    
    # 添加筛选条件
    if province:
        query = query.filter(models.POI.province == province)
    if city:
        query = query.filter(models.POI.city == city)
    if category:
        query = query.filter(models.POI.category == category)
    if level:
        query = query.filter(models.POI.level == level)
    
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def get_pois_in_radius(
    db: Session, 
    center_lng: float, 
    center_lat: float, 
    radius: float, 
    q: Optional[str] = None,
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    offset: int = 0, 
    limit: int = 100
):
    # 使用简化的距离计算 (平面欧氏距离，适用于小范围)
    # 实际应用中应使用Haversine公式或地理空间扩展
    query = db.query(models.POI).filter(
        func.sqrt(
            func.pow(models.POI.longitude - center_lng, 2) + 
            func.pow(models.POI.latitude - center_lat, 2)
        ) <= radius / 111000  # 转换为经纬度距离 (约 111km/度)
    )
    
    # 添加搜索条件
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(models.POI.name.like(search_pattern))
    
    # 添加筛选条件
    if province:
        query = query.filter(models.POI.province == province)
    if city:
        query = query.filter(models.POI.city == city)
    if category:
        query = query.filter(models.POI.category == category)
    if level:
        query = query.filter(models.POI.level == level)
    
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def create_poi(db: Session, poi: schemas.POICreate, user_id: int) -> models.POI:
    """创建新的POI"""
    try:
        # 验证经纬度
        if not (-180 <= poi.longitude <= 180 and -90 <= poi.latitude <= 90):
            raise APIError(
                code=ErrorCode.INVALID_COORDINATES,
                message="无效的经纬度坐标",
                details={
                    "longitude": poi.longitude,
                    "latitude": poi.latitude
                }
            )
        
        db_poi = models.POI(**poi.dict(), created_by=user_id)
        db.add(db_poi)
        db.commit()
        db.refresh(db_poi)
        return db_poi
    except SQLAlchemyError as e:
        db.rollback()
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="创建POI失败",
            details={"error": str(e)}
        )

def update_poi(db: Session, poi_id: int, poi_update: schemas.POIUpdate) -> models.POI:
    """更新POI信息"""
    try:
        db_poi = get_poi(db, poi_id)
        if not db_poi:
            raise APIError(
                code=ErrorCode.POI_NOT_FOUND,
                message=f"ID为{poi_id}的POI不存在"
            )
            
        # 验证经纬度（如果提供）
        if poi_update.longitude is not None and poi_update.latitude is not None:
            if not (-180 <= poi_update.longitude <= 180 and -90 <= poi_update.latitude <= 90):
                raise APIError(
                    code=ErrorCode.INVALID_COORDINATES,
                    message="无效的经纬度坐标",
                    details={
                        "longitude": poi_update.longitude,
                        "latitude": poi_update.latitude
                    }
                )
        
        update_data = poi_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_poi, key, value)
            
        db.commit()
        db.refresh(db_poi)
        return db_poi
    except SQLAlchemyError as e:
        db.rollback()
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="更新POI失败",
            details={"error": str(e)}
        )

def delete_poi(db: Session, poi_id: int):
    db_poi = get_poi(db, poi_id)
    if not db_poi:
        return False
    
    # 删除扩展信息
    db.query(models.POIExtension).filter(
        models.POIExtension.poi_id == poi_id
    ).delete()
    
    # 删除POI
    db.delete(db_poi)
    db.commit()
    return True
