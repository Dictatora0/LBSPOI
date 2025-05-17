# lbs242502POI信息服务系统

#### 介绍
242502学期基于位置的服务课程设计代码仓库。这是一个基于 FastAPI 实现的 POI信息服务系统，按照 RESTful 风格进行API设计，提供 Web 地图应用前端。

## 团队成员及分工

| 姓名   | 学号       | 主要分工                                   |
| ------ | ---------- | ------------------------------------------ |
| 李富麟   | 2023302111204   | 后端API设计与实现、数据库设计、API测试、项目部署 |
| 张喆   | 2023302101126   | 前端界面开发、地图组件集成、用户交互体验优化 |
| 萨日娜   | 2023302101082   | 前端界面开发、地图组件集成、用户交互体验优化 |

## 功能

- **API安全**：用户认证、授权和公众用户访问限速
- **角色权限**：
  - 管理员：对POI数据进行增删改查管理、设置用户权限、管理API密钥调用限制
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
  - 个人信息管理

## 系统架构

- **后端**：FastAPI
- **数据库**：MySQL
- **前端**：Vue.js + Element UI
- **地图**：Leaflet.js

## 安装和使用

### 安装步骤

1. **克隆代码库**

```bash
git clone git@github.com:Dictatora0/LBSPOI.git
cd poi-service
```

2. **安装依赖**

```bash
pip install -r requirements.txt
```

3. **配置环境变量**

在 `backend/poi_service/` 目录下创建 `.env` 文件。确保至少包含以下内容：

```env
# 数据库配置 (请根据您的实际MySQL配置修改)
DATABASE_URL=mysql://username:password@localhost/poi_database

# 安全配置 (建议生成一个新的密钥)
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 高德地图API配置 (必需，用于地图服务功能)
# 请替换为您的有效高德Web服务API密钥
GAODE_API_KEY="your-gaode-api-key-here" 
```

**注意**: `GAODE_API_KEY` 对于系统的地图服务功能（如地理编码、路径规划等）是必需的。请从高德开放平台获取有效的Web服务API Key并配置。

4. **初始化数据库**

进入后端服务目录并执行以下命令以创建数据库表：
```bash
cd backend/poi_service
python -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(bind=database.engine)"
```
**管理员账户**:
此命令仅创建表结构。系统默认不创建管理员账户。您需要：
  a. 手动通过数据库客户端创建一个用户，并将其 `role` 字段设置为 `admin`。
  b. 或者，先注册一个普通用户，然后通过数据库客户端修改其 `role` 为 `admin`。例如，我们测试时使用的 `tempadmin` 用户就是这样创建的。

5. **导入示例数据** 

```bash
python import_data.py path/to/your/poi_data.csv
```

6. **运行应用**

确保您位于 `backend/poi_service/` 目录下：
```bash
cd backend/poi_service
uvicorn app.main:app --reload --port 8080
```

应用将在 http://localhost:8080 运行。API根路径为 http://localhost:8080/api。

## API文档

访问 http://localhost:8080/api/docs 查看Swagger API文档。
访问 http://localhost:8080/api/redoc 查看ReDoc API文档。

## 前端应用

访问 http://localhost:8000 使用Web前端应用

## API测试

项目根目录下提供了一个API测试脚本 `test_api.sh`，用于对后端API进行自动化测试。

**使用方法:**

1.  确保后端服务正在 `http://localhost:8080` 运行。
2.  确保 `backend/poi_service/.env` 文件已正确配置，特别是 `GAODE_API_KEY`。
3.  确保数据库中存在一个名为 `tempadmin` 的用户，其密码为 `password123`，并且角色为 `admin`。此用户用于执行脚本中的管理员权限操作。
    (如果不存在，请先注册 `tempadmin`，然后通过数据库将其角色更新为 `admin`: `UPDATE users SET role = 'admin' WHERE username = 'tempadmin';`)
4.  确保您的系统中已安装 `jq` (JSON命令行处理器)。如果未安装，可以使用包管理器安装 (例如 `sudo apt-get install jq` 或 `brew install jq`)。
5.  在项目根目录下，给脚本执行权限:
    ```bash
    chmod +x test_api.sh
    ```
6.  运行脚本:
    ```bash
    ./test_api.sh
    ```
脚本将输出每个测试步骤的详细信息和API响应。

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


