# FastAPI 主程序

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import os

from app import models, database, crud, gaode_api
from app.schemas import POI
from app.config import settings
from app.middlewares import RequestLoggerMiddleware, ErrorHandlerMiddleware
from app.routers import auth, users, pois, map

# 定义前端目录的绝对路径
frontend_dir = "/Users/lifulin/Desktop/LBSF/frontend"

# 创建数据库表
models.Base.metadata.create_all(bind=database.engine)

# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="POI信息服务系统API接口",
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json"
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源的请求，生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加自定义中间件
app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(RequestLoggerMiddleware)

# 挂载静态文件目录 - 使用正确的绝对路径
static_dir = os.path.join(frontend_dir, "static")
js_dir = os.path.join(frontend_dir, "js")
app.mount("/static", StaticFiles(directory=static_dir), name="static")
app.mount("/js", StaticFiles(directory=js_dir), name="js")

# 配置模板引擎 - 使用正确的绝对路径
templates = Jinja2Templates(directory=frontend_dir)

# 包含各模块路由
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(users.router, prefix=settings.API_PREFIX)
app.include_router(pois.router, prefix=settings.API_PREFIX)
app.include_router(map.router, prefix=settings.API_PREFIX)

# 前端页面路由
@app.get("/")
async def frontend_app(request: Request):
    """提供Web前端应用"""
    return templates.TemplateResponse("index.html", {"request": request})

# 健康检查端点
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

# API根端点
@app.get(settings.API_PREFIX)
async def api_root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs_url": f"{settings.API_PREFIX}/docs",
        "message": "欢迎使用POI信息服务系统API"
    }

# 移除了旧的 /api/pois 和 /api/pois/nearby 路由，它们已在 pois.router 和 map.router 中定义