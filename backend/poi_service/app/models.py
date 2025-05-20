# SQLAlchemy 模型
# 本文件定义了应用的数据库模型，使用SQLAlchemy ORM

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Boolean, DateTime, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

# 创建基类，所有模型类都将继承自此类
Base = declarative_base()

class UserRole(enum.Enum):
    """
    用户角色枚举
    定义系统中的用户类型和权限级别
    
    ADMIN: 内部数据维护人员，可以进行POI数据的增删改查
    PUBLIC: 公众用户，只能进行POI数据查询和维护个人信息
    """
    ADMIN = "admin"  # 内部数据维护人员
    PUBLIC = "public"  # 公众用户
    
class User(Base):
    """
    用户模型
    存储系统用户信息，包括认证信息和角色权限
    """
    __tablename__ = "users"  # 数据库表名
    
    # 主键和基本用户信息
    id = Column(Integer, primary_key=True, index=True)  # 用户ID，主键
    username = Column(String(50), unique=True, nullable=False)  # 用户名，唯一且必填
    email = Column(String(100), unique=True, nullable=False)  # 邮箱，唯一且必填
    hashed_password = Column(String(200), nullable=False)  # 加密后的密码哈希，不存储明文密码
    role = Column(Enum(UserRole), default=UserRole.PUBLIC)  # 用户角色，默认为公众用户
    is_active = Column(Boolean, default=True)  # 用户状态，默认为活跃
    created_at = Column(DateTime, default=datetime.utcnow)  # 创建时间，自动设置为当前时间
    
    # 关系定义
    # cascade="all, delete-orphan" 表示当用户被删除时，关联的API密钥也会被删除
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")  # 用户的API密钥
    created_pois = relationship("POI", back_populates="creator")  # 用户创建的POI记录
    
class APIKey(Base):
    """
    API密钥模型
    存储用户的API访问密钥，用于认证和速率限制
    """
    __tablename__ = "api_keys"  # 数据库表名
    
    # 基本字段
    id = Column(Integer, primary_key=True, index=True)  # API密钥ID，主键
    key = Column(String(100), unique=True, nullable=False, index=True)  # 实际的API密钥字符串，唯一且必填，索引用于快速查找
    user_id = Column(Integer, ForeignKey("users.id"))  # 所属用户的ID，外键
    is_active = Column(Boolean, default=True)  # 密钥状态，默认为活跃
    created_at = Column(DateTime, default=datetime.utcnow)  # 创建时间
    last_used_at = Column(DateTime, nullable=True)  # 最后使用时间，用于跟踪活跃度
    rate_limit = Column(Integer, default=100)  # 每日请求限制，默认为100次/天
    
    # 关系定义
    # back_populates确保双向关系，可以通过user访问APIKey，也可以通过APIKey访问user
    user = relationship("User", back_populates="api_keys")  # 所属用户

class POI(Base):
    """
    POI(Point of Interest)模型
    存储地理兴趣点信息，如景点、餐厅、商店等
    """
    __tablename__ = "pois"  # 数据库表名
    
    # 基本字段
    id = Column(Integer, primary_key=True, index=True)  # POI ID，主键
    name = Column(String(100), nullable=False, index=True)  # POI名称，必填且索引便于搜索
    province = Column(String(50), index=True)  # 省份，索引用于按地区筛选
    city = Column(String(50), index=True)  # 城市，索引用于按地区筛选
    category = Column(String(50), index=True)  # 类别（如景点、餐饮、购物等），索引用于按类别筛选
    level = Column(String(20), index=True)  # 等级（如5A景区、米其林餐厅星级等）
    longitude = Column(Float, nullable=False)  # 经度，必填
    latitude = Column(Float, nullable=False)  # 纬度，必填
    description = Column(Text, nullable=True)  # 详细描述，可为空
    address = Column(String(200), nullable=True)  # 详细地址，可为空
    created_at = Column(DateTime, default=datetime.utcnow)  # 创建时间
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)  # 更新时间，每次更新自动更新
    created_by = Column(Integer, ForeignKey("users.id"))  # 创建者用户ID，外键
    
    # 关系定义
    creator = relationship("User", back_populates="created_pois")  # 创建者用户
    # cascade="all, delete-orphan" 表示当POI被删除时，关联的扩展信息也会被删除
    extensions = relationship("POIExtension", back_populates="poi", cascade="all, delete-orphan")  # POI的扩展信息

class POIExtension(Base):
    """
    POI扩展信息模型
    存储POI的额外信息，如图片、联系方式、开放时间等
    设计为单独的表，便于扩展且不影响主表性能
    """
    __tablename__ = "poi_extensions"  # 数据库表名
    
    # 基本字段
    id = Column(Integer, primary_key=True, index=True)  # 扩展信息ID，主键
    poi_id = Column(Integer, ForeignKey("pois.id"))  # 关联的POI ID，外键
    image_url = Column(String(255), nullable=True)  # 图片链接，可为空
    website = Column(String(255), nullable=True)  # 官网主页URL，可为空
    phone = Column(String(50), nullable=True)  # 联系电话，可为空
    opening_hours = Column(String(200), nullable=True)  # 开放时间，可为空
    ticket_info = Column(Text, nullable=True)  # 票务信息，可为空，Text类型支持较长文本
    
    # 关系定义
    poi = relationship("POI", back_populates="extensions")  # 关联的POI

class RequestLog(Base):
    """
    请求日志模型
    记录API请求信息，用于审计、监控和速率限制
    """
    __tablename__ = "request_logs"  # 数据库表名
    
    # 基本字段
    id = Column(Integer, primary_key=True, index=True)  # 日志ID，主键
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # 请求用户ID，可为空（如匿名请求）
    api_key = Column(String(100), nullable=True)  # 使用的API密钥，可为空（如JWT认证）
    endpoint = Column(String(200), nullable=False)  # 请求的API端点路径
    method = Column(String(10), nullable=False)  # HTTP方法（GET、POST等）
    status_code = Column(Integer, nullable=False)  # HTTP状态码
    ip_address = Column(String(50), nullable=True)  # 请求的IP地址，可为空
    timestamp = Column(DateTime, default=datetime.utcnow)  # 请求时间戳
    
    # 关系定义
    user = relationship("User")  # 关联的用户，注意这里没有back_populates
