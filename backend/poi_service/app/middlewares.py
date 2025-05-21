# 中间件模块
# 负责在FastAPI请求处理流程中添加各种处理逻辑，如日志记录、错误处理和编码处理

import logging
from fastapi import Request, Response, FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
import time
import traceback
import json
from typing import Optional

from app.database import SessionLocal
from app.errors import APIError, ErrorCode
from app import crud

# 配置日志记录器
# 设置日志的格式和级别，方便调试和监控
logging.basicConfig(
    level=logging.INFO,  # 日志级别设置为INFO，可以记录常规操作信息
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'  # 日志格式：时间-名称-级别-消息
)
logger = logging.getLogger(__name__)  # 获取当前模块的日志记录器

class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """
    请求日志中间件
    
    负责记录所有HTTP请求的详细信息，包括：
    - 请求方法和URL
    - 客户端IP地址
    - 请求头信息
    - 处理时间
    - 响应状态码
    
    同时将请求信息保存到数据库中，用于审计和统计分析。
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # 记录请求开始时间，用于计算处理时间
        start_time = time.time()
        
        # 获取客户端IP地址
        ip_address = request.client.host if request.client else None
        
        # 记录请求路径和方法
        method = request.method  # HTTP方法：GET, POST, PUT等
        endpoint = request.url.path  # 请求的URL路径
        
        # 获取API密钥（如果有），用于追踪和限制API使用
        api_key = request.headers.get("X-API-Key")
        
        # 创建数据库会话，用于记录请求日志到数据库
        db = SessionLocal()
        
        # 初始化用户ID，后续可能会根据认证信息设置
        user_id = None
        
        # 记录请求信息到日志
        logger.info(
            f"Request: {method} {endpoint}"
            f" - Client: {ip_address}"
            f" - Headers: {dict(request.headers)}"
        )
        
        try:
            # 调用下一个中间件或路由处理程序
            # 在此处，请求将传递给路由处理函数或其他中间件
            response = await call_next(request)
            
            # 计算请求处理时间（秒）
            process_time = time.time() - start_time
            
            # 添加处理时间到响应头，便于调试和性能监控
            response.headers["X-Process-Time"] = str(process_time)
            
            # 获取响应状态码
            status_code = response.status_code
            
            # 获取用户ID（如果是已认证用户）
            # 在认证中间件中，可能会将用户信息存储在request.state中
            if hasattr(request.state, "user") and request.state.user:
                user_id = request.state.user.id
            
            # 将请求信息记录到数据库，用于统计和审计
            crud.log_request(
                db=db,
                user_id=user_id,
                api_key=api_key,
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                ip_address=ip_address
            )
            
            # 记录响应信息到日志
            logger.info(
                f"Response: {status_code}"
                f" - Process Time: {process_time:.2f}s"
                f" - Content-Type: {response.headers.get('content-type', 'unknown')}"
            )
            
            return response
        except Exception as e:
            # 发生异常时记录错误请求到数据库
            # 即使请求处理失败，也要保留请求记录用于分析
            status_code = 500  # 内部服务器错误
            crud.log_request(
                db=db,
                user_id=user_id,
                api_key=api_key,
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                ip_address=ip_address
            )
            
            # 记录错误信息到日志，包括完整的堆栈跟踪
            logger.error(
                f"Error processing request: {str(e)}"
                f"\nTraceback: {traceback.format_exc()}"
            )
            # 重新抛出异常，让其他异常处理中间件处理
            raise
        finally:
            # 确保在任何情况下都关闭数据库会话，防止资源泄漏
            db.close()

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    错误处理中间件
    
    统一处理应用中的异常，将其转换为结构化的JSON响应，包括：
    1. 处理自定义APIError异常，保留其错误码和消息
    2. 处理未预期的异常，将其转换为通用的内部服务器错误
    3. 记录异常详情到日志，便于调试
    
    确保所有异常都能以一致的格式返回给客户端。
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            # 尝试处理请求
            return await call_next(request)
        except APIError as e:
            # 处理自定义API错误
            # 这些是应用程序主动抛出的已知错误类型
            logger.warning(f"API Error: {e.code} - {e.message}", exc_info=False) # 记录自定义API错误
            return JSONResponse(
                status_code=e.status_code,
                content=e.to_dict()
            )
        except Exception as e:
            # 记录原始异常的详细信息
            logger.error(f"Unhandled exception caught: {type(e).__name__} - {str(e)}", exc_info=True)
            
            # 处理未捕获的异常
            error_details = {
                "code": ErrorCode.UNKNOWN_ERROR,
                "message": "服务器内部错误",
                "details": {
                    # 尝试更安全地转换异常信息为字符串
                    "error": repr(e) 
                }
            }
            
            # 仅在调试模式下添加简化后的堆栈信息
            if request.app.debug:
                # 获取堆栈信息，但可能截断或简化以避免序列化问题
                tb_lines = traceback.format_exc().splitlines()
                # 只取最后几行或限制总长度
                simplified_traceback = "\n".join(tb_lines[-10:]) 
                if len(simplified_traceback) > 1000: # 限制长度
                    simplified_traceback = simplified_traceback[:1000] + "... (truncated)"
                error_details["details"]["traceback_summary"] = simplified_traceback
            
            try:
                return JSONResponse(
                    status_code=500,
                    content=error_details
                )
            except Exception as serialization_error:
                # 如果序列化仍然失败，返回通用的错误
                logger.critical(f"Failed to serialize error response: {serialization_error}", exc_info=True)
                return JSONResponse(
                    status_code=500,
                    content={
                        "code": ErrorCode.UNKNOWN_ERROR,
                        "message": "服务器内部错误，且错误响应序列化失败"
                    }
                )

def setup_middlewares(app: FastAPI):
    """
    配置中间件函数
    
    为FastAPI应用添加所有必要的中间件。
    中间件将按照添加的相反顺序执行（后添加的先执行）。
    
    :param app: FastAPI应用实例
    """
    # CORS中间件 - 允许跨域资源共享
    # 对于前后端分离的应用，这是必要的
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],         # 允许所有来源的请求，生产环境应限制为特定域名
        allow_credentials=True,      # 允许携带凭证（如cookie）
        allow_methods=["*"],         # 允许所有HTTP方法
        allow_headers=["*"],         # 允许所有请求头
    )
    
    # 编码处理中间件 - 确保请求和响应的字符编码正确
    @app.middleware("http")
    async def encoding_middleware(request: Request, call_next):
        # 设置请求编码
        # 确保JSON请求体使用UTF-8编码，处理中文等非ASCII字符
        if request.headers.get("content-type", "").startswith("application/json"):
            body = await request.body()
            try:
                text = body.decode("utf-8")
                request._body = text.encode("utf-8")
            except UnicodeDecodeError:
                pass  # 如果解码失败，保持原始请求体不变

        # 获取响应
        response = await call_next(request)
        
        # 设置响应头和编码
        if isinstance(response, JSONResponse):
            # 明确指定JSON响应的字符集为UTF-8
            response.headers["Content-Type"] = "application/json; charset=utf-8"
            
            # 确保响应内容正确编码，特别是处理中文字符
            if hasattr(response, "body"):
                try:
                    content = json.loads(response.body.decode("utf-8"))
                    # 重新序列化JSON，确保非ASCII字符正确处理，不进行ASCII转义
                    response.body = json.dumps(
                        content,
                        ensure_ascii=False,      # 不将非ASCII字符转换为\uXXXX序列
                        allow_nan=False,         # 不允许NaN值，遵循严格的JSON规范
                        separators=(",", ":"),   # 使用紧凑格式，减少响应大小
                    ).encode("utf-8")
                except (UnicodeDecodeError, json.JSONDecodeError):
                    pass  # 如果解析失败，保持原始响应不变
                    
        return response