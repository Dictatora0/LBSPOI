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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """
    中间件：记录请求日志
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # 记录请求开始时间
        start_time = time.time()
        
        # 获取客户端IP
        ip_address = request.client.host if request.client else None
        
        # 记录请求路径和方法
        method = request.method
        endpoint = request.url.path
        
        # 获取API密钥（如果有）
        api_key = request.headers.get("X-API-Key")
        
        # 创建数据库会话
        db = SessionLocal()
        
        # 初始化用户ID
        user_id = None
        
        # 记录请求信息
        logger.info(
            f"Request: {method} {endpoint}"
            f" - Client: {ip_address}"
            f" - Headers: {dict(request.headers)}"
        )
        
        try:
            # 调用下一个中间件或路由处理程序
            response = await call_next(request)
            
            # 计算请求处理时间
            process_time = time.time() - start_time
            
            # 添加处理时间头
            response.headers["X-Process-Time"] = str(process_time)
            
            # 记录请求日志
            status_code = response.status_code
            
            # 获取用户ID（如果是已认证用户）
            if hasattr(request.state, "user") and request.state.user:
                user_id = request.state.user.id
            
            crud.log_request(
                db=db,
                user_id=user_id,
                api_key=api_key,
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                ip_address=ip_address
            )
            
            # 记录响应信息
            logger.info(
                f"Response: {status_code}"
                f" - Process Time: {process_time:.2f}s"
                f" - Content-Type: {response.headers.get('content-type', 'unknown')}"
            )
            
            return response
        except Exception as e:
            # 发生异常时记录错误请求
            status_code = 500
            crud.log_request(
                db=db,
                user_id=user_id,
                api_key=api_key,
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                ip_address=ip_address
            )
            
            # 记录错误信息
            logger.error(
                f"Error processing request: {str(e)}"
                f"\nTraceback: {traceback.format_exc()}"
            )
            raise
        finally:
            db.close()

class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    中间件：统一错误处理
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
        except APIError as e:
            # 处理自定义API错误
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
                    "error": repr(e) # 使用repr可能比str更安全
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
                # 如果序列化仍然失败，返回一个非常通用的错误
                logger.critical(f"Failed to serialize error response: {serialization_error}", exc_info=True)
                return JSONResponse(
                    status_code=500,
                    content={
                        "code": ErrorCode.UNKNOWN_ERROR,
                        "message": "服务器内部错误，且错误响应序列化失败"
                    }
                )

def setup_middlewares(app: FastAPI):
    """配置中间件"""
    # CORS中间件
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # 编码处理中间件
    @app.middleware("http")
    async def encoding_middleware(request: Request, call_next):
        # 设置请求编码
        if request.headers.get("content-type", "").startswith("application/json"):
            body = await request.body()
            try:
                text = body.decode("utf-8")
                request._body = text.encode("utf-8")
            except UnicodeDecodeError:
                pass

        # 获取响应
        response = await call_next(request)
        
        # 设置响应头
        if isinstance(response, JSONResponse):
            response.headers["Content-Type"] = "application/json; charset=utf-8"
            
            # 确保响应内容正确编码
            if hasattr(response, "body"):
                try:
                    content = json.loads(response.body.decode("utf-8"))
                    response.body = json.dumps(
                        content,
                        ensure_ascii=False,
                        allow_nan=False,
                        separators=(",", ":"),
                    ).encode("utf-8")
                except (UnicodeDecodeError, json.JSONDecodeError):
                    pass
                    
        return response