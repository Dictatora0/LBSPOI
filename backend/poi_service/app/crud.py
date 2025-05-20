# 数据库操作封装模块 (crud.py)
# 本模块实现了所有与数据库交互的操作，遵循CRUD（创建、读取、更新、删除）模式
# 提供了对用户账户、API密钥、POI数据和请求日志等实体的管理功能

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


# 用户管理相关函数

def get_user(db: Session, user_id: int):
    """
    根据用户ID获取用户
    
    :param db: 数据库会话
    :param user_id: 用户ID
    :return: 用户对象，如果不存在则返回None
    """
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    """
    根据用户名获取用户
    
    用于用户登录验证和检查用户名是否已存在
    :param db: 数据库会话
    :param username: 用户名
    :return: 用户对象，如果不存在则返回None
    """
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    """
    根据邮箱获取用户
    
    用于检查邮箱是否已被注册
    :param db: 数据库会话
    :param email: 邮箱地址
    :return: 用户对象，如果不存在则返回None
    """
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    """
    获取用户列表，支持分页
    
    主要用于管理员查看所有用户
    :param db: 数据库会话
    :param skip: 跳过的记录数量
    :param limit: 返回的最大记录数量
    :return: 用户对象列表
    """
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, role: models.UserRole = models.UserRole.PUBLIC):
    """
    创建新用户
    
    将用户密码哈希后存储，设置用户角色（默认为公众用户）
    :param db: 数据库会话
    :param user: 包含用户信息的Pydantic模型
    :param role: 用户角色，默认为PUBLIC
    :return: 创建后的用户对象
    """
    hashed_password = get_password_hash(user.password)  # 对密码进行安全哈希
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
    """
    更新用户信息
    
    仅更新提供的字段，如果包含密码则重新哈希
    :param db: 数据库会话
    :param user_id: 要更新的用户ID
    :param user_update: 包含要更新字段的Pydantic模型
    :return: 更新后的用户对象，如果用户不存在则返回None
    """
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    # 仅获取实际设置的字段（非None值）
    update_data = user_update.dict(exclude_unset=True)
    
    # 如果更新包含密码，则对密码进行哈希处理
    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
    
    # 更新用户字段
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    return db_user


# API密钥管理相关函数

def create_api_key(db: Session, user_id: int, rate_limit: int = 100):
    """
    为用户创建API密钥
    
    生成随机UUID作为API密钥，设置请求速率限制
    :param db: 数据库会话
    :param user_id: 用户ID
    :param rate_limit: 每日请求次数限制
    :return: 创建的API密钥对象
    """
    # 生成随机的API密钥
    api_key = uuid.uuid4().hex  # 生成32字符的随机十六进制字符串
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
    """
    根据密钥字符串获取API密钥对象
    
    用于验证API请求的密钥
    :param db: 数据库会话
    :param key: API密钥字符串
    :return: API密钥对象，如果不存在则返回None
    """
    return db.query(models.APIKey).filter(models.APIKey.key == key).first()

def get_user_api_keys(db: Session, user_id: int):
    """
    获取用户的所有API密钥
    
    :param db: 数据库会话
    :param user_id: 用户ID
    :return: API密钥对象列表
    """
    return db.query(models.APIKey).filter(models.APIKey.user_id == user_id).all()

def deactivate_api_key(db: Session, key: str):
    """
    停用API密钥（逻辑删除）
    
    将密钥的is_active字段设置为False，而不是从数据库中物理删除
    :param db: 数据库会话
    :param key: API密钥字符串
    :return: 操作成功返回True，密钥不存在则返回False
    """
    db_api_key = get_api_key(db, key)
    if db_api_key:
        db_api_key.is_active = False
        db.commit()
        return True
    return False


# 请求日志相关函数


def log_request(db: Session, user_id: Optional[int], api_key: Optional[str], 
                endpoint: str, method: str, status_code: int, ip_address: Optional[str] = None):
    """
    记录API请求日志
    
    用于审计、监控和API使用统计
    :param db: 数据库会话
    :param user_id: 用户ID（如果已认证）
    :param api_key: 使用的API密钥（如果有）
    :param endpoint: 请求的API端点
    :param method: HTTP方法（GET、POST等）
    :param status_code: HTTP状态码
    :param ip_address: 客户端IP地址
    :return: 创建的请求日志对象
    """
    log_entry = models.RequestLog(
        user_id=user_id,
        api_key=api_key,
        endpoint=endpoint,
        method=method,
        status_code=status_code,
        ip_address=ip_address,
        timestamp=datetime.utcnow()  # 使用UTC时间记录
    )
    db.add(log_entry)
    db.commit()
    return log_entry

def count_requests_by_api_key(db: Session, api_key: str, since: datetime):
    """
    统计API密钥在指定时间后的请求次数
    
    用于实现API使用频率限制
    :param db: 数据库会话
    :param api_key: API密钥
    :param since: 起始时间点（通常是当天开始）
    :return: 请求次数
    """
    return db.query(models.RequestLog).filter(
        models.RequestLog.api_key == api_key,
        models.RequestLog.timestamp >= since
    ).count()


# POI数据管理相关函数


def get_poi(db: Session, poi_id: int) -> Optional[models.POI]:
    """
    根据ID获取单个POI
    
    包含异常处理，转换数据库异常为API错误
    :param db: 数据库会话
    :param poi_id: POI的ID
    :return: POI对象，如果不存在则返回None
    :raises: APIError - 如果数据库操作出错
    """
    try:
        return db.query(models.POI).filter(models.POI.id == poi_id).first()
    except SQLAlchemyError as e:
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="数据库查询错误",
            details={"error": str(e)}
        )

def get_poi_by_name(db: Session, name: str):
    """
    根据名称获取POI
    
    用于检查POI名称是否已存在
    :param db: 数据库会话
    :param name: POI名称
    :return: POI对象，如果不存在则返回None
    """
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
    """
    获取POI列表，支持多种过滤条件和分页
    
    :param db: 数据库会话
    :param province: 可选的省份过滤条件
    :param city: 可选的城市过滤条件 
    :param category: 可选的类别过滤条件
    :param level: 可选的级别过滤条件
    :param has_extension: 可选的是否有扩展信息过滤条件
    :param offset: 分页偏移量
    :param limit: 每页条数
    :return: 包含POI列表和总数的字典
    :raises: APIError - 如果数据库操作出错
    """
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
                query = query.filter(models.POI.extensions.any())  # 有扩展信息
            else:
                query = query.filter(~models.POI.extensions.any())  # 没有扩展信息
        
        # 获取总数
        total = query.count()
        
        # 应用分页并获取结果
        items = query.offset(offset).limit(limit).all()
        
        return {"items": items, "total": total}
    except SQLAlchemyError as e:
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="数据库查询错误",
            details={"error": str(e)}
        )

def search_pois_by_name(db: Session, name_query: str, offset: int = 0, limit: int = 10):
    """
    根据名称模糊搜索POI
    
    :param db: 数据库会话
    :param name_query: 搜索关键词
    :param offset: 分页偏移量
    :param limit: 每页条数
    :return: 包含搜索结果和总数的字典
    """
    search_pattern = f"%{name_query}%"  # 构建LIKE模式匹配字符串
    query = db.query(models.POI).filter(models.POI.name.like(search_pattern))
    
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def get_pois_in_bounding_box(
    db: Session, 
    min_lng: float,   # 最小经度
    min_lat: float,   # 最小纬度
    max_lng: float,   # 最大经度
    max_lat: float,   # 最大纬度
    q: Optional[str] = None,  # 可选的关键词搜索
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    offset: int = 0, 
    limit: int = 100
):
    """
    获取指定地理边界框内的POI
    
    根据经纬度范围查询POI，支持额外的关键词和属性过滤
    :param db: 数据库会话
    :param min_lng: 最小经度（左边界）
    :param min_lat: 最小纬度（下边界）
    :param max_lng: 最大经度（右边界）
    :param max_lat: 最大纬度（上边界）
    :param q: 可选的名称关键词
    :param province: 可选的省份过滤
    :param city: 可选的城市过滤
    :param category: 可选的类别过滤
    :param level: 可选的级别过滤
    :param offset: 分页偏移量
    :param limit: 每页条数
    :return: 包含POI列表和总数的字典
    """
    # 首先筛选在边界框内的POI
    query = db.query(models.POI).filter(
        models.POI.longitude >= min_lng,
        models.POI.longitude <= max_lng,
        models.POI.latitude >= min_lat,
        models.POI.latitude <= max_lat
    )
    
    # 添加名称搜索条件
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(models.POI.name.like(search_pattern))
    
    # 添加属性筛选条件
    if province:
        query = query.filter(models.POI.province == province)
    if city:
        query = query.filter(models.POI.city == city)
    if category:
        query = query.filter(models.POI.category == category)
    if level:
        query = query.filter(models.POI.level == level)
    
    # 获取总数和分页结果
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def get_pois_in_radius(
    db: Session, 
    center_lng: float,  # 中心点经度
    center_lat: float,  # 中心点纬度
    radius: float,      # 半径（米）
    q: Optional[str] = None,
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    offset: int = 0, 
    limit: int = 100
):
    """
    获取指定中心点半径范围内的POI
    
    使用简化的欧氏距离计算（适用于小范围查询）
    注意：该方法在纬度较高的地区可能不够精确
    对于高精度需求，应使用地理空间函数（如PostGIS的ST_DWithin）
    
    :param db: 数据库会话
    :param center_lng: 中心点经度
    :param center_lat: 中心点纬度
    :param radius: 半径，单位为米
    :param q: 可选的名称关键词
    :param province: 可选的省份过滤
    :param city: 可选的城市过滤
    :param category: 可选的类别过滤
    :param level: 可选的级别过滤
    :param offset: 分页偏移量
    :param limit: 每页条数
    :return: 包含POI列表和总数的字典
    """
    # 使用简化的距离计算 (平面欧氏距离，适用于小范围)
    # 将半径（米）转换为大致的经纬度差值
    # 每度经纬度约为111公里(111000米)，这是近似值
    query = db.query(models.POI).filter(
        func.sqrt(
            func.pow(models.POI.longitude - center_lng, 2) + 
            func.pow(models.POI.latitude - center_lat, 2)
        ) <= radius / 111000  # 转换为经纬度距离单位
    )
    
    # 添加名称搜索条件
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(models.POI.name.like(search_pattern))
    
    # 添加属性筛选条件
    if province:
        query = query.filter(models.POI.province == province)
    if city:
        query = query.filter(models.POI.city == city)
    if category:
        query = query.filter(models.POI.category == category)
    if level:
        query = query.filter(models.POI.level == level)
    
    # 获取总数和分页结果
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return {"items": items, "total": total}

def create_poi(db: Session, poi: schemas.POICreate, user_id: int) -> models.POI:
    """
    创建新的POI记录
    
    支持创建带扩展信息的POI，并进行坐标有效性验证
    :param db: 数据库会话
    :param poi: 包含POI数据的Pydantic模型
    :param user_id: 创建者的用户ID
    :return: 创建的POI对象
    :raises: APIError - 如果坐标无效或数据库操作失败
    """
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
        
        # 准备POI基本数据
        poi_data = poi.dict(exclude={"extension"})
        db_poi = models.POI(**poi_data, created_by=user_id)
        
        # 处理扩展信息
        if poi.extension:
            extension_data = poi.extension.dict()
            # 创建扩展信息并建立与POI的关联
            db_extension = models.POIExtension(**extension_data)
            db_poi.extensions.append(db_extension) # 通过追加到关系集合来建立关联

        # 保存POI和关联的扩展信息
        db.add(db_poi)
        db.commit()
        db.refresh(db_poi) # 刷新数据以获取数据库生成的ID和默认值
        
        return db_poi
    except SQLAlchemyError as e:
        # 出现异常时回滚事务
        db.rollback()
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="创建POI失败",
            details={"error": str(e)}
        )

def update_poi(db: Session, poi_id: int, poi_update: schemas.POIUpdate) -> models.POI:
    """
    更新现有POI记录
    
    支持部分更新（只更新提供的字段）和扩展信息的更新/创建
    :param db: 数据库会话
    :param poi_id: 要更新的POI ID
    :param poi_update: 包含更新数据的Pydantic模型
    :return: 更新后的POI对象
    :raises: APIError - 如果POI不存在、坐标无效或数据库操作失败
    """
    try:
        # 检查POI是否存在
        db_poi = get_poi(db, poi_id)
        if not db_poi:
            raise APIError(
                code=ErrorCode.POI_NOT_FOUND,
                message=f"ID为{poi_id}的POI不存在"
            )
            
        # 如果提供了经纬度，验证其有效性
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
        
        # 更新POI基本信息（仅更新提供的字段）
        update_data = poi_update.dict(exclude_unset=True, exclude={'extension'})
        for key, value in update_data.items():
            setattr(db_poi, key, value)

        # 处理扩展信息的更新
        extension_updated_or_created = False
        if poi_update.extension is not None:
            extension_data = poi_update.extension.dict(exclude_unset=True)
            if db_poi.extensions: # 如果已存在扩展信息，更新它
                existing_extension = db_poi.extensions[0] # 假设POI最多有一个扩展信息
                for ext_key, ext_value in extension_data.items():
                    setattr(existing_extension, ext_key, ext_value)
                extension_updated_or_created = True
            else: # 如果不存在扩展信息，则创建新的
                if extension_data: # 确保有数据才创建
                    new_extension = models.POIExtension(**extension_data)
                    db_poi.extensions.append(new_extension)
                    extension_updated_or_created = True
            
        # 保存更改
        db.commit()
        db.refresh(db_poi) # 刷新POI对象自身属性
        
        # 如果扩展信息被更新或创建，确保关系被正确加载
        if extension_updated_or_created:
            # 标记extensions关系为过期，确保下次访问时重新加载
            db.expire(db_poi, ['extensions'])

        return db_poi
    except SQLAlchemyError as e:
        # 出现异常时回滚事务
        db.rollback()
        raise APIError(
            code=ErrorCode.DATABASE_ERROR,
            message="更新POI失败",
            details={"error": str(e)}
        )

def delete_poi(db: Session, poi_id: int):
    """
    删除POI记录
    
    先删除关联的扩展信息，再删除POI本身
    :param db: 数据库会话
    :param poi_id: 要删除的POI ID
    :return: 删除成功返回True，POI不存在返回False
    """
    # 检查POI是否存在
    db_poi = get_poi(db, poi_id)
    if not db_poi:
        return False
    
    try:
        # 删除扩展信息（通过显式查询删除，避免级联删除问题）
        db.query(models.POIExtension).filter(
            models.POIExtension.poi_id == poi_id
        ).delete()
        
        # 删除POI本身
        db.delete(db_poi)
        db.commit()
        return True
    except SQLAlchemyError:
        # 出现异常时回滚事务并返回失败
        db.rollback()
        return False
