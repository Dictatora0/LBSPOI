# Pydantic 模式定义

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    PUBLIC = "public"

# 用户相关模式
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True
        use_enum_values = True

# API密钥相关模式
class APIKeyCreate(BaseModel):
    pass  # 不需要输入，自动生成

class APIKey(BaseModel):
    key: str
    created_at: datetime
    is_active: bool
    rate_limit: int

    class Config:
        orm_mode = True
        use_enum_values = True

# POI相关模式
class POIExtensionBase(BaseModel):
    image_url: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    ticket_info: Optional[str] = None

class POIExtensionCreate(POIExtensionBase):
    pass

class POIExtension(POIExtensionBase):
    id: int
    poi_id: int

    class Config:
        orm_mode = True

class POIBase(BaseModel):
    name: str
    province: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    longitude: float
    latitude: float
    description: Optional[str] = None
    address: Optional[str] = None

class POICreate(POIBase):
    extension: Optional[POIExtensionCreate] = None

class POIUpdate(BaseModel):
    name: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    description: Optional[str] = None
    address: Optional[str] = None
    extension: Optional[POIExtensionCreate] = None

class POI(POIBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    extensions: Optional[List[POIExtension]] = []

    class Config:
        orm_mode = True

# 地图查询参数模式
class BoundingBoxQuery(BaseModel):
    min_lng: float = Field(..., description="最小经度")
    min_lat: float = Field(..., description="最小纬度")
    max_lng: float = Field(..., description="最大经度")
    max_lat: float = Field(..., description="最大纬度")
    q: Optional[str] = Field(None, description="搜索关键词")
    province: Optional[str] = Field(None, description="省份筛选")
    city: Optional[str] = Field(None, description="城市筛选")
    category: Optional[str] = Field(None, description="类别筛选")
    level: Optional[str] = Field(None, description="等级筛选")

class RadiusQuery(BaseModel):
    center_lng: float = Field(..., description="中心点经度")
    center_lat: float = Field(..., description="中心点纬度")
    radius: float = Field(..., description="半径（米）")
    q: Optional[str] = Field(None, description="搜索关键词")
    province: Optional[str] = Field(None, description="省份筛选")
    city: Optional[str] = Field(None, description="城市筛选")
    category: Optional[str] = Field(None, description="类别筛选")
    level: Optional[str] = Field(None, description="等级筛选")

# 响应模式
class ErrorResponse(BaseModel):
    code: int
    message: str
    details: Optional[Dict[str, Any]] = None
    debug_url: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    size: int
    pages: int
