from enum import Enum
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings

# API错误码枚举
# 定义系统中所有可能的错误类型，并为每种错误分配唯一的数字编码
# 使用分类编码系统，便于组织和维护：
# - 10xx: 通用错误
# - 11xx: 认证错误
# - 12xx: 授权错误
# - 13xx: 用户相关错误
# - 14xx: POI相关错误
# - 15xx: 数据库错误
# - 16xx: 外部服务错误
class ErrorCode(int, Enum):
    # 通用错误 (10xx)
    UNKNOWN_ERROR = 1000      # 未知或未分类的错误
    INVALID_INPUT = 1001      # 输入参数验证失败
    RESOURCE_NOT_FOUND = 1002 # 请求的资源不存在
    
    # 认证错误 (11xx)
    AUTHENTICATION_FAILED = 1100  # 一般认证失败
    INVALID_CREDENTIALS = 1101    # 用户名或密码错误
    INVALID_TOKEN = 1102          # JWT令牌无效
    EXPIRED_TOKEN = 1103          # JWT令牌已过期
    INVALID_API_KEY = 1104        # API密钥无效
    
    # 授权错误 (12xx)
    PERMISSION_DENIED = 1200        # 无权访问
    INSUFFICIENT_PRIVILEGES = 1201  # 权限不足
    RATE_LIMIT_EXCEEDED = 1202      # 超出API使用频率限制
    
    # 用户相关错误 (13xx)
    USER_ALREADY_EXISTS = 1300    # 用户名或邮箱已被使用
    USER_NOT_FOUND = 1301         # 用户不存在
    
    # POI相关错误 (14xx)
    POI_NOT_FOUND = 1400           # POI不存在
    POI_ALREADY_EXISTS = 1401      # POI已存在
    INVALID_COORDINATES = 1402     # 经纬度坐标无效
    
    # 数据库错误 (15xx)
    DATABASE_ERROR = 1500          # 数据库操作异常
    
    # 外部服务错误 (16xx)
    EXTERNAL_SERVICE_ERROR = 1600  # 一般外部服务调用错误
    MAP_SERVICE_ERROR = 1601       # 地图服务(如高德地图API)调用错误

# 错误信息映射
# 将错误码映射到人类可读的错误消息
# 集中管理所有错误消息，便于维护
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
# 将内部错误码映射到适当的HTTP状态码
# 这样客户端可以通过HTTP状态码快速了解错误的大致类型
ERROR_STATUS_CODES = {
    # 通用错误
    ErrorCode.UNKNOWN_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,      # 500 服务器内部错误
    ErrorCode.INVALID_INPUT: status.HTTP_400_BAD_REQUEST,                # 400 请求无效
    ErrorCode.RESOURCE_NOT_FOUND: status.HTTP_404_NOT_FOUND,             # 404 资源未找到
    
    # 认证错误
    ErrorCode.AUTHENTICATION_FAILED: status.HTTP_401_UNAUTHORIZED,       # 401 未授权
    ErrorCode.INVALID_CREDENTIALS: status.HTTP_401_UNAUTHORIZED,         # 401 未授权
    ErrorCode.INVALID_TOKEN: status.HTTP_401_UNAUTHORIZED,               # 401 未授权
    ErrorCode.EXPIRED_TOKEN: status.HTTP_401_UNAUTHORIZED,               # 401 未授权
    ErrorCode.INVALID_API_KEY: status.HTTP_401_UNAUTHORIZED,             # 401 未授权
    
    # 授权错误
    ErrorCode.PERMISSION_DENIED: status.HTTP_403_FORBIDDEN,              # 403 禁止访问
    ErrorCode.INSUFFICIENT_PRIVILEGES: status.HTTP_403_FORBIDDEN,        # 403 禁止访问
    ErrorCode.RATE_LIMIT_EXCEEDED: status.HTTP_429_TOO_MANY_REQUESTS,    # 429 请求过多
    
    # 用户相关错误
    ErrorCode.USER_ALREADY_EXISTS: status.HTTP_409_CONFLICT,             # 409 资源冲突
    ErrorCode.USER_NOT_FOUND: status.HTTP_404_NOT_FOUND,                 # 404 资源未找到
    
    # POI相关错误
    ErrorCode.POI_NOT_FOUND: status.HTTP_404_NOT_FOUND,                  # 404 资源未找到
    ErrorCode.POI_ALREADY_EXISTS: status.HTTP_409_CONFLICT,              # 409 资源冲突
    ErrorCode.INVALID_COORDINATES: status.HTTP_400_BAD_REQUEST,          # 400 请求无效
    
    # 数据库错误
    ErrorCode.DATABASE_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,     # 500 服务器内部错误
    
    # 外部服务错误
    ErrorCode.EXTERNAL_SERVICE_ERROR: status.HTTP_502_BAD_GATEWAY,       # 502 网关错误
    ErrorCode.MAP_SERVICE_ERROR: status.HTTP_502_BAD_GATEWAY,            # 502 网关错误
}

class APIError(Exception):
    """
    自定义API错误类
    
    继承自Python标准Exception类，用于在应用中统一处理错误。
    封装错误码、错误消息、HTTP状态码和详细信息，
    提供转换为HTTP异常和字典的方法，便于在响应中使用。
    """
    
    def __init__(
        self, 
        code: ErrorCode,                           # 错误码，从ErrorCode枚举中选择
        message: Optional[str] = None,             # 可选的自定义错误消息，覆盖默认消息
        details: Optional[Dict[str, Any]] = None,  # 可选的错误详情，可包含任何附加信息
    ):
        """
        初始化API错误
        
        :param code: 错误码枚举值
        :param message: 可选的自定义错误消息，如果未提供，则使用映射中的默认消息
        :param details: 可选的错误详情字典，用于提供更多上下文信息
        """
        self.code = code  # 错误码
        self.message = message or ERROR_MESSAGES.get(code, "未知错误")  # 错误消息，优先使用自定义消息
        self.status_code = ERROR_STATUS_CODES.get(code, status.HTTP_500_INTERNAL_SERVER_ERROR)  # HTTP状态码
        self.details = details  # 错误详情
        # 调试URL，指向可能的错误文档或调试资源
        self.debug_url = f"{settings.DEBUG_URL_BASE}{code}"
        
    def to_dict(self):
        """
        将错误转换为字典表示
        
        用于序列化错误对象为JSON响应。
        包含错误码、消息、详情(如果有)和调试URL(如果有)。
        """
        error_dict = {
            "code": self.code,       # 错误码枚举值
            "message": self.message,  # 错误消息
        }
        
        # 仅当提供了详情时才包含
        if self.details:
            error_dict["details"] = self.details
            
        # 仅当提供了调试URL时才包含
        if self.debug_url:
            error_dict["debug_url"] = self.debug_url
            
        return error_dict
        
    def raise_http_exception(self):
        """
        抛出FastAPI的HTTPException
        
        方便在路由函数中使用，例如:
        ```
        if not db_user:
            raise APIError(
                code=ErrorCode.USER_NOT_FOUND,
                message="用户不存在"
            ).raise_http_exception()
        ```
        """
        raise HTTPException(
            status_code=self.status_code,  # 使用映射的HTTP状态码
            detail=self.to_dict(),         # 错误详情使用字典表示
        )