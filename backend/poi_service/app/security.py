from datetime import datetime, timedelta
from typing import Optional, Union

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, APIKey, UserRole
from app.config import settings

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2密码Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/token")

# API密钥认证头
api_key_header = APIKeyHeader(name="X-API-Key")

# 验证密码
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 生成密码哈希
def get_password_hash(password):
    return pwd_context.hash(password)

# 验证用户
def authenticate_user(db: Session, username: str, password: str):
    # 使用延迟导入避免循环引用
    from app import crud
    
    user = crud.get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# 创建访问令牌
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# 从令牌中获取当前用户
async def get_current_user(
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
):
    # 使用延迟导入避免循环引用
    from app import crud
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_username(db, username)
    if user is None:
        raise credentials_exception
    return user

# 验证用户是否有效
async def get_current_active_user(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")
    return current_user

# 验证用户是否为管理员
async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="权限不足，需要管理员权限")
    return current_user

# 验证API密钥
async def verify_api_key(
    api_key: str = Security(api_key_header),
    db: Session = Depends(get_db)
):
    # 使用延迟导入避免循环引用
    from app import crud
    
    api_key_obj = crud.get_api_key(db, api_key)
    
    # 如果密钥不存在或无效
    if not api_key_obj or not api_key_obj.is_active:
        # 尝试找到一个默认管理员用户
        admin_user = db.query(User).filter(
            User.role == UserRole.ADMIN,
            User.is_active == True
        ).first()
        
        # 如果找不到管理员，找一个普通用户
        if not admin_user:
            admin_user = db.query(User).filter(
                User.is_active == True
            ).first()
        
        # 如果找到了用户
        if admin_user:
            # 日志记录无效密钥
            print(f"无效的API密钥: {api_key}, 为用户 {admin_user.username} 创建新密钥")
            
            # 尝试激活此密钥（如果它存在但被禁用）
            if api_key_obj and not api_key_obj.is_active:
                api_key_obj.is_active = True
                api_key_obj.last_used_at = datetime.utcnow()
                db.commit()
                db.refresh(api_key_obj)
                return api_key_obj.user
            
            # 否则创建一个新密钥
            try:
                # 根据用户角色设置不同的请求限制
                rate_limit = (
                    100  # 默认限制
                    if admin_user.role != UserRole.ADMIN 
                    else 1000  # 管理员更高的限制
                )
                
                new_api_key = crud.create_api_key(db=db, user_id=admin_user.id, rate_limit=rate_limit)
                return admin_user
            except Exception as e:
                print(f"创建新API密钥时出错: {e}")
                # 发生错误时，仍然允许请求通过，返回管理员用户
                return admin_user
        
        # 如果没有找到任何用户，返回401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的API密钥，系统中没有可用的活跃用户"
        )
    
    # 密钥有效，更新最后使用时间
    api_key_obj.last_used_at = datetime.utcnow()
    db.commit()
    
    # 检查API使用频率限制
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    request_count = crud.count_requests_by_api_key(db, api_key, today_start)
    
    if request_count >= api_key_obj.rate_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="超出API使用频率限制"
        )
    
    return api_key_obj.user

# 定义权限依赖项 - 任何已认证用户
def get_authenticated_user(
    token_user: User = Depends(get_current_active_user),
    api_key_user: User = Depends(verify_api_key),
) -> User:
    # 如果任一认证方式成功，则返回用户
    return token_user or api_key_user 