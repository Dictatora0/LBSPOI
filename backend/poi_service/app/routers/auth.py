from datetime import timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, schemas, models
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import (
    authenticate_user, 
    create_access_token,
    get_current_active_user,
    get_current_admin_user
)
from app.config import settings

router = APIRouter(
    prefix="/auth",
    tags=["认证和授权"],
    responses={401: {"description": "未授权"}},
)

@router.post("/register", response_model=schemas.User)
async def register_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    """公众用户注册（默认为PUBLIC角色）"""
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="用户名已被使用"
        ).raise_http_exception()
    
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="邮箱已被使用"
        ).raise_http_exception()
    
    # 创建公众用户
    db_user = crud.create_user(db=db, user=user, role=models.UserRole.PUBLIC)
    
    # 手动转换为字典返回，确保枚举值正确处理
    return {
        "id": db_user.id,
        "username": db_user.username,
        "email": db_user.email,
        "role": db_user.role.value,
        "is_active": db_user.is_active,
        "created_at": db_user.created_at
    }

@router.post("/admin/create", response_model=schemas.User)
async def create_admin_user(
    user: schemas.UserCreate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """创建内部维护人员账号（仅超级管理员）"""
    # 检查当前用户是否有权限创建管理员
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有管理员可以创建内部维护人员账号"
        ).raise_http_exception()
    
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="用户名已被使用"
        ).raise_http_exception()
    
    # 创建内部维护人员账号
    db_user = crud.create_user(db=db, user=user, role=models.UserRole.ADMIN)
    
    # 手动转换为字典返回，确保枚举值正确处理
    return {
        "id": db_user.id,
        "username": db_user.username,
        "email": db_user.email,
        "role": db_user.role.value,
        "is_active": db_user.is_active,
        "created_at": db_user.created_at
    }

@router.post("/token", response_model=schemas.TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """用户登录获取访问令牌"""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise APIError(
            code=ErrorCode.INVALID_CREDENTIALS,
            message="用户名或密码错误"
        ).raise_http_exception()
    
    if not user.is_active:
        raise APIError(
            code=ErrorCode.AUTHENTICATION_FAILED,
            message="用户已被禁用"
        ).raise_http_exception()
    
    # 生成访问令牌
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value
    }

@router.post("/apikey", response_model=schemas.APIKey)
async def create_api_key(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """为当前用户创建API密钥"""
    # 根据用户角色设置不同的请求限制
    rate_limit = (
        settings.ADMIN_RATE_LIMIT 
        if current_user.role == models.UserRole.ADMIN 
        else settings.DEFAULT_RATE_LIMIT
    )
    
    return crud.create_api_key(db=db, user_id=current_user.id, rate_limit=rate_limit)

@router.get("/apikeys", response_model=List[schemas.APIKey])
async def list_api_keys(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的所有API密钥"""
    return crud.get_user_api_keys(db=db, user_id=current_user.id)

@router.delete("/apikeys/{key}")
async def deactivate_api_key(
    key: str,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """停用指定的API密钥"""
    api_key = crud.get_api_key(db=db, key=key)
    if not api_key or api_key.user_id != current_user.id:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="无权停用此API密钥"
        ).raise_http_exception()
    
    crud.deactivate_api_key(db=db, key=key)
    return {"message": "API密钥已停用"}