import os
from datetime import timedelta
from pydantic import BaseSettings
from dotenv import load_dotenv

load_dotenv()

# 应用配置类
class Settings(BaseSettings):
    # 数据库配置
    DATABASE_URL: str = os.getenv("DATABASE_URL", "mysql://root:12345678@localhost:3306/LBSPOI")
    
    # 应用元数据
    APP_NAME: str = "POI信息服务系统"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # 安全配置
    SECRET_KEY: str = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
    
    # 默认管理员账户 (从环境变量读取)
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@example.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "changeme") # 强烈建议在.env中设置复杂密码
    
    # API限流配置
    DEFAULT_RATE_LIMIT: int = 100  # 默认每日请求限制
    ADMIN_RATE_LIMIT: int = 10000  # 管理员每日请求限制
    GAODE_API_DAILY_LIMIT: int = int(os.getenv("GAODE_API_DAILY_LIMIT", 500)) # 高德逆地理编码每日限制
    GAODE_API_DELAY: float = float(os.getenv("GAODE_API_DELAY", 0.05)) # 高德API调用间隔（秒）
    
    # 错误调试信息基础URL
    DEBUG_URL_BASE: str = "https://api.poi-service.example.com/docs/errors/"
    
    # 高德地图API配置
    GAODE_API_KEY: str = os.getenv("GAODE_API_KEY", "")
    
    class Config:
        env_file = ".env"

# 创建设置实例
settings = Settings()

# 导出一些常用配置常量
DATABASE_URL = settings.DATABASE_URL
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
API_PREFIX = settings.API_PREFIX