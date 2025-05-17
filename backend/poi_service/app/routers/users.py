from typing import List
from fastapi import APIRouter, Depends, Path, Body, HTTPException
from sqlalchemy.orm import Session
from app import crud, schemas, models
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import get_current_active_user, get_current_admin_user, verify_api_key
from pydantic import BaseModel

router = APIRouter(
    prefix="/users",
    tags=["用户管理"],
)

# 添加用于接收请求体的模型
class UserRoleUpdate(BaseModel):
    role: models.UserRole

class UserStatusUpdate(BaseModel):
    is_active: bool  # 直接使用is_active字段

# === 用户个人信息管理（所有已认证用户可访问）===
@router.get("/me", response_model=schemas.User)
async def read_user_me(
    current_user: models.User = Depends(get_current_active_user)
):
    """获取当前用户信息"""
    # 手动转换 SQLAlchemy 模型到字典，确保枚举值被转换为字符串
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
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """更新当前用户信息"""
    if user_update.email:
        # 检查邮箱是否已被其他用户使用
        existing_user = crud.get_user_by_email(db, email=user_update.email)
        if existing_user and existing_user.id != current_user.id:
            raise APIError(
                code=ErrorCode.USER_ALREADY_EXISTS,
                message="此邮箱已被其他用户使用"
            ).raise_http_exception()

    if user_update.username:
        # 检查用户名是否已被其他用户使用
        existing_user = crud.get_user_by_username(db, username=user_update.username)
        if existing_user and existing_user.id != current_user.id:
            raise APIError(
                code=ErrorCode.USER_ALREADY_EXISTS,
                message="此用户名已被使用"
            ).raise_http_exception()

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
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """获取所有用户列表（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以查看用户列表"
        ).raise_http_exception()
    
    users = crud.get_users(db, skip=skip, limit=limit)
    
    # 手动转换列表中的每个用户对象
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
    user_id: int = Path(..., title="用户ID"),
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """获取指定用户信息（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以查看用户详情"
        ).raise_http_exception()
        
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
    user_id: int,
    role_update: UserRoleUpdate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """更新用户角色（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以修改用户角色"
        ).raise_http_exception()

    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise APIError(
            code=ErrorCode.USER_NOT_FOUND,
            message=f"ID为{user_id}的用户不存在"
        ).raise_http_exception()

    # 更新用户角色
    db_user.role = role_update.role
    db.commit()
    db.refresh(db_user)
    
    return {"message": f"用户角色已更新为{role_update.role.value}"}

@router.put("/{user_id}/status")
async def toggle_user_status(
    user_id: int,
    status_update: UserStatusUpdate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """启用或禁用用户（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以启用或禁用用户"
        ).raise_http_exception()

    # 防止管理员禁用自己
    if user_id == current_user.id:
        raise APIError(
            code=ErrorCode.OPERATION_NOT_ALLOWED,
            message="不能修改自己的账户状态"
        ).raise_http_exception()

    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise APIError(
            code=ErrorCode.USER_NOT_FOUND,
            message=f"ID为{user_id}的用户不存在"
        ).raise_http_exception()

    # 更新用户状态
    db_user.is_active = status_update.is_active
    db.commit()
    db.refresh(db_user)
    
    status_message = "启用" if status_update.is_active else "禁用"
    return {"message": f"用户已{status_message}"}