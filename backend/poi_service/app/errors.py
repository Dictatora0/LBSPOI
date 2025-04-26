from enum import Enum
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings

# API错误码枚举
class ErrorCode(int, Enum):
    # 通用错误 (10xx)
    UNKNOWN_ERROR = 1000
    INVALID_INPUT = 1001
    RESOURCE_NOT_FOUND = 1002
    
    # 认证错误 (11xx)
    AUTHENTICATION_FAILED = 1100
    INVALID_CREDENTIALS = 1101
    INVALID_TOKEN = 1102
    EXPIRED_TOKEN = 1103
    INVALID_API_KEY = 1104
    
    # 授权错误 (12xx)
    PERMISSION_DENIED = 1200
    INSUFFICIENT_PRIVILEGES = 1201
    RATE_LIMIT_EXCEEDED = 1202
    
    # 用户相关错误 (13xx)
    USER_ALREADY_EXISTS = 1300
    USER_NOT_FOUND = 1301
    
    # POI相关错误 (14xx)
    POI_NOT_FOUND = 1400
    POI_ALREADY_EXISTS = 1401
    INVALID_COORDINATES = 1402
    
    # 数据库错误 (15xx)
    DATABASE_ERROR = 1500
    
    # 外部服务错误 (16xx)
    EXTERNAL_SERVICE_ERROR = 1600
    MAP_SERVICE_ERROR = 1601

# 错误信息映射
ERROR_MESSAGES = {
    # 通用错误
    ErrorCode.UNKNOWN_ERROR: "发生未知错误",
    ErrorCode.INVALID_INPUT: "无效的输入参数",
    ErrorCode.RESOURCE_NOT_FOUND: "请求的资源不存在",
    
    # 认证错误
    ErrorCode.AUTHENTICATION_FAILED: "认证失败",
    ErrorCode.INVALID_CREDENTIALS: "无效的认证凭据",
    ErrorCode.INVALID_TOKEN: "无效的令牌",
    ErrorCode.EXPIRED_TOKEN: "令牌已过期",
    ErrorCode.INVALID_API_KEY: "无效的API密钥",
    
    # 授权错误
    ErrorCode.PERMISSION_DENIED: "权限被拒绝",
    ErrorCode.INSUFFICIENT_PRIVILEGES: "权限不足",
    ErrorCode.RATE_LIMIT_EXCEEDED: "超出API使用频率限制",
    
    # 用户相关错误
    ErrorCode.USER_ALREADY_EXISTS: "用户已存在",
    ErrorCode.USER_NOT_FOUND: "用户不存在",
    
    # POI相关错误
    ErrorCode.POI_NOT_FOUND: "POI不存在",
    ErrorCode.POI_ALREADY_EXISTS: "POI已存在",
    ErrorCode.INVALID_COORDINATES: "无效的坐标",
    
    # 数据库错误
    ErrorCode.DATABASE_ERROR: "数据库操作错误",
    
    # 外部服务错误
    ErrorCode.EXTERNAL_SERVICE_ERROR: "外部服务错误",
    ErrorCode.MAP_SERVICE_ERROR: "地图服务错误",
}

# HTTP状态码映射
ERROR_STATUS_CODES = {
    # 通用错误
    ErrorCode.UNKNOWN_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.INVALID_INPUT: status.HTTP_400_BAD_REQUEST,
    ErrorCode.RESOURCE_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    
    # 认证错误
    ErrorCode.AUTHENTICATION_FAILED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.INVALID_CREDENTIALS: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.INVALID_TOKEN: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.EXPIRED_TOKEN: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.INVALID_API_KEY: status.HTTP_401_UNAUTHORIZED,
    
    # 授权错误
    ErrorCode.PERMISSION_DENIED: status.HTTP_403_FORBIDDEN,
    ErrorCode.INSUFFICIENT_PRIVILEGES: status.HTTP_403_FORBIDDEN,
    ErrorCode.RATE_LIMIT_EXCEEDED: status.HTTP_429_TOO_MANY_REQUESTS,
    
    # 用户相关错误
    ErrorCode.USER_ALREADY_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.USER_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    
    # POI相关错误
    ErrorCode.POI_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ErrorCode.POI_ALREADY_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.INVALID_COORDINATES: status.HTTP_400_BAD_REQUEST,
    
    # 数据库错误
    ErrorCode.DATABASE_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    
    # 外部服务错误
    ErrorCode.EXTERNAL_SERVICE_ERROR: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.MAP_SERVICE_ERROR: status.HTTP_502_BAD_GATEWAY,
}

class APIError(Exception):
    """自定义API错误类"""
    
    def __init__(
        self, 
        code: ErrorCode, 
        message: Optional[str] = None, 
        details: Optional[Dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, "未知错误")
        self.status_code = ERROR_STATUS_CODES.get(code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.details = details
        self.debug_url = f"{settings.DEBUG_URL_BASE}{code}"
        
    def to_dict(self):
        """转换为字典表示"""
        error_dict = {
            "code": self.code,
            "message": self.message,
        }
        
        if self.details:
            error_dict["details"] = self.details
            
        if self.debug_url:
            error_dict["debug_url"] = self.debug_url
            
        return error_dict
        
    def raise_http_exception(self):
        """抛出FastAPI的HTTPException"""
        raise HTTPException(
            status_code=self.status_code,
            detail=self.to_dict(),
        )