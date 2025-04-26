# lbs242502POI信息服务系统

#### 介绍
242502学期基于位置的服务课程设计代码仓库。这是一个基于 FastAPI 实现的 POI信息服务系统，按照 RESTful 风格进行API设计，提供 Web 地图应用前端。

## 功能特性

- **API安全**：用户认证、授权和公众用户访问限速
- **角色权限**：
  - 内部数据维护人员：对POI数据进行增删改查管理
  - 公众用户：用户注册、个人信息维护、APIKEY获取和POI数据查询
- **POI查询**：
  - 按名称查询
  - 按省份查询
  - 按类别查询
  - 按拉框范围查询（地图交互）
  - 按中心半径查询（地图交互）
  - 按是否有扩展信息查询
- **标准化数据格式**：
  - JSON格式返回
  - HTTP状态码
  - 业务错误代码
  - 错误描述
  - 扩展调试信息
- **高德地图API集成**：
  - 地理编码
  - 逆地理编码
  - 周边设施查询
  - 路径规划
- **Web前端应用**：
  - 交互式地图
  - POI信息可视化
  - 用户登录注册
  - API密钥管理

## 系统架构

- **后端**：FastAPI
- **数据库**：MySQL
- **前端**：Vue.js + Element UI
- **地图**：Leaflet.js

## 安装和使用

### 环境要求

- Python 3.8+
- MySQL 5.7+

### 安装步骤

1. **克隆代码库**

```bash
git clone https://github.com/yourusername/poi-service.git
cd poi-service
```

2. **安装依赖**

```bash
pip install -r requirements.txt
```

3. **配置环境变量**

创建 `.env` 文件（或复制 `.env.example`）:

```
# 数据库配置
DATABASE_URL=mysql://username:password@localhost/poi_database

# 安全配置
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 高德地图API配置
GAODE_API_KEY=your-gaode-api-key
```

4. **初始化数据库**

```bash
python -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(engine)"
```

5. **导入示例数据** (可选)

```bash
python import_data.py path/to/your/poi_data.csv
```

6. **运行应用**

```bash
uvicorn app.main:app --reload
```

应用将在 http://localhost:8000 运行



cd /Users/lifulin/Desktop/LBSF/backend/poi_service
uvicorn app.main:app --reload --port 8080


## API文档

访问 http://localhost:8000/api/docs 查看Swagger API文档

## 前端应用

访问 http://localhost:8000 使用Web前端应用

## 项目结构

```
poi_service/
├── app/
│   ├── frontend/           # 前端资源
│   ├── routers/            # API路由
│   ├── config.py           # 配置
│   ├── crud.py             # 数据库操作
│   ├── database.py         # 数据库连接
│   ├── errors.py           # 错误处理
│   ├── gaode_api.py        # 高德API
│   ├── main.py             # 应用入口
│   ├── middlewares.py      # 中间件
│   ├── models.py           # 数据模型
│   ├── schemas.py          # 数据模式
│   └── security.py         # 安全处理
├── .env                    # 环境变量
├── import_data.py          # 数据导入脚本
├── requirements.txt        # 依赖项
└── README.md
```
