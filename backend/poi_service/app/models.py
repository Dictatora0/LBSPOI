# SQLAlchemy 模型

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Boolean, DateTime, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

Base = declarative_base()

class UserRole(enum.Enum):
    """用户角色枚举
    ADMIN: 内部数据维护人员，可以进行POI数据的增删改查
    PUBLIC: 公众用户，只能进行POI数据查询和维护个人信息
    """
    ADMIN = "admin"  # 内部数据维护人员
    PUBLIC = "public"  # 公众用户
    
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.PUBLIC)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    created_pois = relationship("POI", back_populates="creator")
    
class APIKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    rate_limit = Column(Integer, default=100)  # 每日请求限制
    
    # 关系
    user = relationship("User", back_populates="api_keys")

class POI(Base):
    __tablename__ = "pois"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    province = Column(String(50), index=True)  # 省份
    city = Column(String(50), index=True)  # 城市
    category = Column(String(50), index=True)  # 类别
    level = Column(String(20), index=True)  # 等级
    longitude = Column(Float, nullable=False)
    latitude = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    address = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # 关系
    creator = relationship("User", back_populates="created_pois")
    extensions = relationship("POIExtension", back_populates="poi", cascade="all, delete-orphan")

class POIExtension(Base):
    __tablename__ = "poi_extensions"
    
    id = Column(Integer, primary_key=True, index=True)
    poi_id = Column(Integer, ForeignKey("pois.id"))
    image_url = Column(String(255), nullable=True)  # 图片链接
    website = Column(String(255), nullable=True)  # 官网主页
    phone = Column(String(50), nullable=True)  # 联系电话
    opening_hours = Column(String(200), nullable=True)  # 开放时间
    ticket_info = Column(Text, nullable=True)  # 票务信息
    
    # 关系
    poi = relationship("POI", back_populates="extensions")

class RequestLog(Base):
    __tablename__ = "request_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    api_key = Column(String(100), nullable=True)
    endpoint = Column(String(200), nullable=False)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    user = relationship("User")
