from datetime import timedelta, datetime
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

# 创建APIRouter实例，指定API路径前缀、标签和通用响应
# prefix: 所有路由都会自动带有"/auth"前缀
# tags: 用于API文档分组显示相关路由
# responses: 定义通用响应码和描述，这里定义了401未授权的情况
router = APIRouter(
    prefix="/auth",
    tags=["认证和授权"],
    responses={401: {"description": "未授权"}},
)

@router.post("/register", response_model=schemas.User)
async def register_user(
    user: schemas.UserCreate,  # 请求体，包含用户注册信息（用户名、邮箱、密码）
    db: Session = Depends(get_db)  # 数据库会话依赖注入
):
    """
    公众用户注册（默认为PUBLIC角色）
    
    接收用户提交的注册信息，验证用户名和邮箱是否已被使用，
    然后创建新用户并返回用户信息（不包含密码）。
    新用户默认被赋予PUBLIC角色。
    """
    # 检查用户名是否已存在
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="用户名已被使用"
        ).raise_http_exception()
    
    # 检查邮箱是否已存在
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="邮箱已被使用"
        ).raise_http_exception()
    
    # 创建公众用户（PUBLIC角色）
    db_user = crud.create_user(db=db, user=user, role=models.UserRole.PUBLIC)
    
    # 手动转换为字典返回，确保枚举值正确处理
    # 注意：这里手动构建响应对象，而不是直接返回ORM模型
    # 这样可以确保枚举类型(如role)被正确转换为字符串，避免序列化问题
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
    user: schemas.UserCreate,  # 请求体，包含用户注册信息
    current_user: models.User = Depends(get_current_admin_user),  # 当前登录的管理员用户
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    创建内部维护人员账号（仅超级管理员）
    
    仅允许已登录的管理员用户调用此接口创建新的管理员账号。
    会验证当前用户是否具有管理员角色，以及新用户名是否可用。
    """
    # 检查当前用户是否有权限创建管理员
    # 注意：这个检查看起来是多余的，因为get_current_admin_user依赖已经检查了用户角色
    # 但保留它可以作为一种额外的安全措施
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有管理员可以创建内部维护人员账号"
        ).raise_http_exception()
    
    # 检查用户名是否已存在
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise APIError(
            code=ErrorCode.USER_ALREADY_EXISTS,
            message="用户名已被使用"
        ).raise_http_exception()
    
    # 创建内部维护人员账号（ADMIN角色）
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
    form_data: OAuth2PasswordRequestForm = Depends(),  # OAuth2表单数据，包含username和password字段
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    用户登录获取访问令牌
    
    验证用户凭据，如果凭据有效且用户处于激活状态，
    则生成并返回JWT访问令牌，用于后续的认证请求。
    
    此端点遵循OAuth2规范，接收x-www-form-urlencoded格式的username和password。
    """
    # 验证用户凭据
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise APIError(
            code=ErrorCode.INVALID_CREDENTIALS,
            message="用户名或密码错误"
        ).raise_http_exception()
    
    # 检查用户是否处于活跃状态
    if not user.is_active:
        raise APIError(
            code=ErrorCode.AUTHENTICATION_FAILED,
            message="用户已被禁用"
        ).raise_http_exception()
    
    # 生成访问令牌
    # 1. 设置令牌过期时间
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # 2. 创建令牌，包含用户名和角色信息
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value},
        expires_delta=access_token_expires
    )
    
    # 返回令牌信息
    return {
        "access_token": access_token,  # JWT令牌
        "token_type": "bearer",        # 令牌类型
        "role": user.role.value        # 用户角色
    }

@router.post("/apikey", response_model=schemas.APIKey)
async def create_api_key(
    current_user: models.User = Depends(get_current_active_user),  #  声明式依赖注入，它会在调用主逻辑前自动执行所依赖的函数。
    
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    创建新的API密钥
    
    为当前登录用户创建一个新的API密钥。
    根据用户角色设置不同的速率限制：管理员用户有更高的请求限制。
    需要JWT认证。
    """
    # 根据用户角色设置不同的请求限制
    # 管理员用户通常有更高的API使用限额
    rate_limit = (
        settings.ADMIN_RATE_LIMIT 
        if current_user.role == models.UserRole.ADMIN 
        else settings.DEFAULT_RATE_LIMIT
    )
    
    # 创建新的API密钥
    api_key = crud.create_api_key(db=db, user_id=current_user.id, rate_limit=rate_limit)
    return api_key

@router.post("/refresh-apikey", response_model=schemas.APIKey)
async def refresh_apikey(
    current_user: models.User = Depends(get_current_active_user),  # 当前已认证的活跃用户
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    刷新API密钥（自动创建新密钥或重新激活旧密钥）
    
    智能地管理用户的API密钥：
    1. 如果用户有未激活的密钥，会重新激活最早的一个
    2. 如果没有未激活的密钥，则创建一个新密钥
    
    这种方法避免了无限制创建新密钥，有助于管理API密钥的生命周期。
    需要JWT认证。
    """
    # 获取用户现有的API密钥
    existing_keys = crud.get_user_api_keys(db, current_user.id)
    
    # 如果有任何未激活的密钥，先尝试重新激活第一个
    # 这种方法优先重用已存在但被停用的密钥，而不是无限制创建新密钥
    inactive_keys = [key for key in existing_keys if not key.is_active]
    if inactive_keys:
        key_to_activate = inactive_keys[0]
        key_to_activate.is_active = True
        key_to_activate.last_used_at = datetime.utcnow()
        db.commit()
        db.refresh(key_to_activate)
        return key_to_activate
    
    # 根据用户角色设置不同的请求限制
    rate_limit = (
        settings.ADMIN_RATE_LIMIT 
        if current_user.role == models.UserRole.ADMIN 
        else settings.DEFAULT_RATE_LIMIT
    )
    
    # 只有在没有可重新激活的密钥时，才创建新密钥
    return crud.create_api_key(db=db, user_id=current_user.id, rate_limit=rate_limit)

@router.get("/apikeys", response_model=List[schemas.APIKey])
async def list_api_keys(
    current_user: models.User = Depends(get_current_active_user),  # 当前已认证的活跃用户
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    获取当前用户的所有API密钥
    
    返回当前已认证用户的所有API密钥列表，包括激活和未激活的密钥。
    需要JWT认证。
    """
    return crud.get_user_api_keys(db=db, user_id=current_user.id)

@router.delete("/apikeys/{key}")
async def deactivate_api_key(
    key: str,  # 要停用的API密钥，路径参数
    current_user: models.User = Depends(get_current_active_user),  # 当前已认证的活跃用户
    db: Session = Depends(get_db)  # 数据库会话
):
    """
    停用指定的API密钥
    
    停用(逻辑删除)指定的API密钥。
    用户只能停用属于自己的API密钥。
    需要JWT认证。
    """
    # 获取API密钥并验证它是否属于当前用户
    api_key = crud.get_api_key(db=db, key=key)
    if not api_key or api_key.user_id != current_user.id:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="无权停用此API密钥"
        ).raise_http_exception()
    
    # 停用API密钥
    crud.deactivate_api_key(db=db, key=key)
    return {"message": "API密钥已停用"}