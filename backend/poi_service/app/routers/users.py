from typing import List
from fastapi import APIRouter, Depends, Path, Body, HTTPException
from sqlalchemy.orm import Session
from app import crud, schemas, models
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import get_current_active_user, get_current_admin_user, verify_api_key
from pydantic import BaseModel

# 创建用户相关路由
# 所有用户管理相关的API端点都在此路由下
# prefix: 所有路由都会自动带有"/users"前缀
# tags: 用于API文档分组
router = APIRouter(
    prefix="/users",
    tags=["用户管理"],
)

# 添加用于接收请求体的模型
class UserRoleUpdate(BaseModel):
    """用于更新用户角色的请求体模型"""
    role: models.UserRole  # 直接使用UserRole枚举，Pydantic会处理验证和序列化

class UserStatusUpdate(BaseModel):
    """用于更新用户状态的请求体模型"""
    is_active: bool  # 直接使用is_active字段表示用户是否被启用

# 用户个人信息管理（所有已认证用户可访问)
@router.get("/me", response_model=schemas.User)
async def read_user_me(
    current_user: models.User = Depends(get_current_active_user)  # 依赖项：当前已认证的活跃用户
):
    """
    获取当前用户信息
    
    返回当前已登录用户的详细信息。
    需要JWT认证。
    """
    # 手动转换 SQLAlchemy 模型到字典，确保枚举值被转换为字符串
    # 这样做是因为FastAPI的响应序列化需要基本类型，而不是SQLAlchemy模型
    # 特别是对于枚举类型，需要使用.value获取其字符串表示
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role.value,  # 直接使用枚举的 value 属性获取字符串
        "is_active": current_user.is_active,
        "created_at": current_user.created_at
    }

@router.put("/me", response_model=schemas.User)
async def update_user_me(
    user_update: schemas.UserUpdate,  # 请求体：包含要更新的用户信息
    current_user: models.User = Depends(get_current_active_user),  # 依赖项：当前已认证的活跃用户
    db: Session = Depends(get_db)  # 依赖项：数据库会话
):
    """
    更新当前用户信息
    
    允许已登录用户更新自己的信息，如邮箱和密码。
    用户名和邮箱会检查唯一性，避免冲突。
    需要JWT认证。
    """
    if user_update.email:
        # 检查邮箱是否已被其他用户使用
        # 注意：如果用户更新为自己当前的邮箱，应该允许
        existing_user = crud.get_user_by_email(db, email=user_update.email)
        if existing_user and existing_user.id != current_user.id:
            raise APIError(
                code=ErrorCode.USER_ALREADY_EXISTS,
                message="此邮箱已被其他用户使用"
            ).raise_http_exception()

    if user_update.username:
        # 检查用户名是否已被其他用户使用
        # 同样，如果用户更新为自己当前的用户名，应该允许
        existing_user = crud.get_user_by_username(db, username=user_update.username)
        if existing_user and existing_user.id != current_user.id:
            raise APIError(
                code=ErrorCode.USER_ALREADY_EXISTS,
                message="此用户名已被使用"
            ).raise_http_exception()

    # 调用crud层函数更新用户信息
    updated_user = crud.update_user(db, current_user.id, user_update)
    # 手动转换为字典返回，确保枚举值正确处理
    if updated_user:
        return {
            "id": updated_user.id,
            "username": updated_user.username,
            "email": updated_user.email,
            "role": updated_user.role.value,
            "is_active": updated_user.is_active,
            "created_at": updated_user.created_at
        }
    # 如果 crud.update_user 返回 None (例如用户未找到，虽然在这个逻辑里不太可能)
    # FastAPI 对于 None 响应 response_model 可能会有不同行为，最好是确保有返回值或抛出HTTPException
    # 但基于crud.update_user的实现，它在找不到用户时应该返回None，这里应该处理这种情况
    # 不过，current_user 本身就是从 get_current_active_user 来的，所以它肯定是存在的
    # crud.update_user 内部 get_user 如果失败会返回None，但它被调用时 user_id 是 current_user.id
    # 所以 updated_user 不太可能是 None，除非数据库在两次查询间隙发生变化
    # 为了健壮性，可以加一个 else 抛出异常，但根据现有逻辑，updated_user 不会是None
    raise HTTPException(status_code=404, detail="User not found after update attempt") # 理论上不应到达这里

# === 用户管理（仅内部维护人员可访问）===
@router.get("/", response_model=List[schemas.User])
async def read_users(
    skip: int = 0,  # 分页参数：跳过前skip条记录
    limit: int = 100,  # 分页参数：返回最多limit条记录
    current_user: models.User = Depends(get_current_admin_user),  # 依赖项：当前已认证的管理员用户
    db: Session = Depends(get_db)  # 依赖项：数据库会话
):
    """
    获取所有用户列表（仅内部维护人员）
    
    返回系统中的所有用户，支持分页查询。
    仅允许管理员用户访问。
    需要JWT认证且具有管理员角色。
    """
    # 注意：这个检查可能是多余的，因为get_current_admin_user依赖应该已经检查了用户角色
    # 但保留它可以作为一种额外的安全措施
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以查看用户列表"
        ).raise_http_exception()
    
    # 调用crud层函数获取用户列表
    users = crud.get_users(db, skip=skip, limit=limit)
    
    # 手动转换列表中的每个用户对象，确保枚举值被正确处理
    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "is_active": user.is_active,
            "created_at": user.created_at
        }
        for user in users
    ]

@router.get("/{user_id}", response_model=schemas.User)
async def read_user(
    user_id: int = Path(..., title="用户ID"),  # 路径参数：要查询的用户ID
    current_user: models.User = Depends(get_current_admin_user),  # 依赖项：当前已认证的管理员用户
    db: Session = Depends(get_db)  # 依赖项：数据库会话
):
    """
    获取指定用户信息（仅内部维护人员）
    
    根据用户ID获取用户的详细信息。
    仅允许管理员用户访问。
    需要JWT认证且具有管理员角色。
    """
    # 同样，这个角色检查可能是多余的
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以查看用户详情"
        ).raise_http_exception()
        
    # 调用crud层函数获取特定用户
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise APIError(
            code=ErrorCode.USER_NOT_FOUND,
            message=f"ID为{user_id}的用户不存在"
        ).raise_http_exception()
        
    # 手动转换为字典返回，确保枚举值正确处理
    return {
        "id": db_user.id,
        "username": db_user.username,
        "email": db_user.email,
        "role": db_user.role.value,
        "is_active": db_user.is_active,
        "created_at": db_user.created_at
    }

@router.put("/{user_id}/role")
async def update_user_role(
    user_id: int,  # 路径参数：要更新角色的用户ID
    role_update: UserRoleUpdate,  # 请求体：包含新的角色信息
    current_user: models.User = Depends(get_current_admin_user),  # 依赖项：当前已认证的管理员用户
    db: Session = Depends(get_db)  # 依赖项：数据库会话
):
    """
    更新用户角色（仅内部维护人员）
    
    允许管理员更改指定用户的角色，如将普通用户提升为管理员或降级。
    仅允许管理员用户访问。
    需要JWT认证且具有管理员角色。
    """
    # 同样，这个角色检查可能是多余的
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以修改用户角色"
        ).raise_http_exception()

    # 检查目标用户是否存在
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise APIError(
            code=ErrorCode.USER_NOT_FOUND,
            message=f"ID为{user_id}的用户不存在"
        ).raise_http_exception()

    # 更新用户角色
    # 直接修改ORM对象并提交，而不是通过crud层函数
    db_user.role = role_update.role
    db.commit()
    db.refresh(db_user)
    
    return {"message": f"用户角色已更新为{role_update.role.value}"}

@router.put("/{user_id}/status")
async def toggle_user_status(
    user_id: int,  # 路径参数：要更新状态的用户ID
    status_update: UserStatusUpdate,  # 请求体：包含新的状态信息
    current_user: models.User = Depends(get_current_admin_user),  # 依赖项：当前已认证的管理员用户
    db: Session = Depends(get_db)  # 依赖项：数据库会话
):
    """
    启用或禁用用户（仅内部维护人员）
    
    允许管理员启用或禁用指定用户的账户。
    禁用的用户将无法登录系统或使用API。
    管理员不能禁用自己的账户。
    仅允许管理员用户访问。
    需要JWT认证且具有管理员角色。
    """
    # 同样，这个角色检查可能是多余的
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以启用或禁用用户"
        ).raise_http_exception()

    # 防止管理员禁用自己，这是一个重要的安全措施
    # 避免管理员意外锁定自己的账户
    if user_id == current_user.id:
        raise APIError(
            code=ErrorCode.OPERATION_NOT_ALLOWED,
            message="不能修改自己的账户状态"
        ).raise_http_exception()

    # 检查目标用户是否存在
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise APIError(
            code=ErrorCode.USER_NOT_FOUND,
            message=f"ID为{user_id}的用户不存在"
        ).raise_http_exception()

    # 更新用户状态
    # 直接修改ORM对象并提交，而不是通过crud层函数
    db_user.is_active = status_update.is_active
    db.commit()
    db.refresh(db_user)
    
    # 根据新状态返回不同的消息
    status_message = "启用" if status_update.is_active else "禁用"
    return {"message": f"用户已{status_message}"}