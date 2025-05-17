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
```

2. **安装依赖**

进入后端服务目录并安装依赖：
```bash
cd backend/poi_service
pip install -r requirements.txt
cd ../.. # 返回项目根目录
```

3. **配置环境变量**

在 `backend/poi_service/` 目录下创建 `.env` 文件。

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
  b. 或者，先注册一个普通用户，然后通过数据库客户端修改其 `role` 为 `admin`。我们测试时使用的 `tempadmin` 用户就是这样创建的。

5. **导入示例数据** 

```bash
cd backend/poi_service
python import_data.py 中国A级景区数据/A级景区WGS84.csv 
cd ../.. # 返回项目根目录
```

6. **运行应用**

确保您位于 `backend/poi_service/` 目录下：
```bash
cd backend/poi_service
uvicorn app.main:app --reload --port 8080
```

应用将在 http://localhost:8080 运行。API根路径为 http://localhost:8080/api。

## API文档

访问 http://localhost:8080/api/redoc 查看ReDoc API文档。

## 前端应用

当后端服务在 `http://localhost:8080` 成功运行后，前端应用可以通过访问后端服务的根URL来使用：
http://localhost:8080

## API端点说明 (RESTful)

系统后端API遵循RESTful设计原则，使用标准的HTTP方法操作资源，并通过HTTP状态码指示操作结果。所有数据交换均采用JSON格式。

### 基础URL
所有API端点的基础URL为 `http://localhost:8080/api`。

### 认证与授权 (`/auth`)

| 方法  | 路径                | 描述                                                       | 主要请求体/参数                 | 成功响应状态码 | 代表性成功响应体示例 (部分字段) |
|-------|---------------------|------------------------------------------------------------|---------------------------------|----------------|-------------------------------|
| `POST`  | `/auth/register`    | 公众用户注册                                               | `UserCreate` schema (username, email, password) | `200 OK`       | `{ "id": 1, "username": "newuser", "email": "new@example.com", "role": "public" }` |
| `POST`  | `/auth/token`       | 用户登录，获取JWT访问令牌                                    | `application/x-www-form-urlencoded` (username, password) | `200 OK`       | `{ "access_token": "jwt.token.here", "token_type": "bearer", "role": "public" }` |
| `POST`  | `/auth/admin/create`| (管理员) 创建内部维护人员账号                                | `UserCreate` schema             | `200 OK`       | `{ "id": 2, "username": "newadmin", "role": "admin" }` |
| `POST`  | `/auth/apikey`      | (认证用户) 创建新的API密钥                                   | (无，基于Token认证)             | `200 OK`       | `{ "key": "apikey_string", "rate_limit": 100 }` |
| `GET`   | `/auth/apikeys`     | (认证用户) 获取当前用户的所有API密钥                         | (无，基于Token认证)             | `200 OK`       | `[ { "key": "apikey1" }, { "key": "apikey2" } ]` |
| `DELETE`| `/auth/apikeys/{key}`| (认证用户) 停用指定的API密钥                                 | Path param: `key`               | `200 OK`       | `{ "message": "API密钥已停用" }` |

### 用户管理 (`/users`)

| 方法  | 路径                | 描述                                         | 认证方式        | 主要请求体/参数                 | 成功响应状态码 | 代表性成功响应体示例 (部分字段) |
|-------|---------------------|----------------------------------------------|-----------------|---------------------------------|----------------|-------------------------------|
| `GET`   | `/users/me`         | 获取当前已认证用户信息                         | JWT Token       | -                               | `200 OK`       | `{ "id": 1, "username": "currentuser", "email": "me@example.com" }` |
| `PUT`   | `/users/me`         | 更新当前已认证用户信息                         | JWT Token       | `UserUpdate` schema             | `200 OK`       | `{ "id": 1, "username": "updateduser" }` |
| `GET`   | `/users/`           | (管理员) 获取所有用户列表                      | JWT Token (Admin) | Query params: `skip`, `limit`   | `200 OK`       | `[ { "id": 1, "username": "user1" }, { "id": 2, "username": "user2" } ]` |
| `GET`   | `/users/{user_id}`  | (管理员) 获取指定ID用户信息                    | JWT Token (Admin) | Path param: `user_id`           | `200 OK`       | `{ "id": 2, "username": "user2" }` |
| `PUT`   | `/users/{user_id}/role` | (管理员) 更新指定用户角色                  | JWT Token (Admin) | Path param: `user_id`, Body: `{"role":"admin"}` | `200 OK`       | `{ "message": "用户角色已更新为admin" }` |
| `PUT`   | `/users/{user_id}/status`| (管理员) 启用或禁用指定用户                | JWT Token (Admin) | Path param: `user_id`, Body: `{"is_active":false}` | `200 OK`       | `{ "message": "用户已禁用" }` |

### POI数据 (`/pois`)

API密钥 (`X-API-KEY` 请求头) 用于访问以下公共查询端点。创建、更新、删除POI需要管理员JWT Token。

| 方法   | 路径                | 描述                                                       | 认证方式        | 主要请求体/参数                                   | 成功响应状态码 | 代表性成功响应体示例 (部分字段) |
|--------|---------------------|------------------------------------------------------------|-----------------|---------------------------------------------------|----------------|-------------------------------|
| `GET`    | `/pois/`            | 获取POI列表，支持多种过滤及分页                              | API Key         | Query params (e.g., `province`, `page`, `size`)   | `200 OK`       | `{ "items": [ { "id": 1, "name": "POI A" } ], "total": 10, "page": 1 }` |
| `GET`    | `/pois/search`      | 按名称关键词搜索POI，支持分页                                | API Key         | Query param: `q` (keyword)                        | `200 OK`       | `{ "items": [ { "id": 2, "name": "Park XYZ" } ], "total": 5 }` |
| `POST`   | `/pois/bbox`        | 获取指定边界框(Bounding Box)内的POI                        | API Key         | `BoundingBoxQuery` schema                         | `200 OK`       | `{ "items": [ { "id": 3, "name": "Museum B" } ] }` |
| `POST`   | `/pois/radius`      | 获取指定中心点和半径范围内的POI                             | API Key         | `RadiusQuery` schema                              | `200 OK`       | `{ "items": [ { "id": 4, "name": "Restaurant C" } ] }` |
| `GET`    | `/pois/{poi_id}`    | 获取指定ID的POI详情                                        | API Key         | Path param: `poi_id`                              | `200 OK`       | `{ "id": 1, "name": "POI A", "province": "省份", "extensions": [] }` |
| `POST`   | `/pois/`            | (管理员) 创建新的POI                                       | JWT Token (Admin) | `POICreate` schema                                | `200 OK`       | `{ "id": 5, "name": "New POI", ... }` |
| `PUT`    | `/pois/{poi_id}`    | (管理员) 更新指定ID的POI信息                               | JWT Token (Admin) | Path param: `poi_id`, Body: `POIUpdate` schema    | `200 OK`       | `{ "id": 5, "name": "Updated POI", ... }` |
| `DELETE` | `/pois/{poi_id}`    | (管理员) 删除指定ID的POI                                   | JWT Token (Admin) | Path param: `poi_id`                              | `200 OK`       | `{ "message": "ID为5的POI已成功删除" }` |

### 地图服务 (`/map`)

API密钥 (`X-API-KEY` 请求头) 用于访问以下所有地图服务。这些服务依赖于后端配置的有效高德地图API Key。

| 方法  | 路径                | 描述                                 | 主要请求体/参数                                                                | 成功响应状态码 | 代表性成功响应体示例 (高德原始响应) |
|-------|---------------------|--------------------------------------|--------------------------------------------------------------------------------|----------------|------------------------------------|
| `GET`   | `/map/nearby`       | 获取指定POI或坐标点附近的设施          | Query params: `poi_id` or (`lat`, `lng`), `keyword`, `radius`                | `200 OK`       | (高德周边搜索API的JSON响应)        |
| `GET`   | `/map/geocode`      | 地理编码：地址转换为经纬度坐标         | Query params: `address`, `city` (optional)                                     | `200 OK`       | (高德地理编码API的JSON响应)          |
| `GET`   | `/map/regeocode`    | 逆地理编码：经纬度坐标转换为地址       | Query params: `lng`, `lat`, `extensions` (optional)                            | `200 OK`       | (高德逆地理编码API的JSON响应)        |
| `GET`   | `/map/route`        | 路径规划 (步行、驾车、公交、骑行)      | Query params: `origin_lng`, `origin_lat`, `dest_lng`, `dest_lat`, `mode`       | `200 OK`       | (高德路径规划API的JSON响应)          |

### 通用约定与状态码
- **成功响应**: 
  - `200 OK`: 请求成功。通常用于 `GET` 获取资源、`PUT` 更新资源、`POST` 创建资源（如果服务器选择不返回 `201`）以及部分 `DELETE` 操作。
  - `201 Created`: (本系统未使用，但RESTful常见) 资源创建成功，通常响应体包含新创建的资源，`Location`头指向新资源URL。
  - `204 No Content`: (本系统未使用，但RESTful常见) 操作成功，但响应体中无内容。通常用于 `DELETE` 成功。
- **客户端错误**: 
  - `400 Bad Request`: 请求无效。例如，请求参数缺失、格式错误，或不符合业务逻辑的简单校验（非Pydantic校验）。
  - `401 Unauthorized`: 未认证。请求需要用户认证，但未提供有效的认证凭据 (如Token无效或缺失)。
  - `403 Forbidden`: 禁止访问。已认证，但当前用户无权执行该操作或访问该资源。
  - `404 Not Found`: 请求的资源不存在。
  - `422 Unprocessable Entity`: 请求体数据无法处理。通常由FastAPI在请求体数据不符合Pydantic模型校验规则时自动返回。
- **服务端错误**: 
  - `500 Internal Server Error`: 服务器内部发生未预期的错误。



## API测试

项目根目录下提供了API测试脚本 `test_api.sh`，用于对后端API进行自动化测试。

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

```text
LBSPOI/ (项目根目录)
├── backend/
│   └── poi_service/            # 后端 FastAPI 应用目录
│       ├── app/                # 应用核心代码
│       │   ├── routers/        # API 路由模块 (auth, users, pois, map)
│       │   ├── config.py       # 应用配置 (环境变量加载、设置类)
│       │   ├── crud.py         # 数据库操作 (Create, Read, Update, Delete)
│       │   ├── database.py     # 数据库连接与会话管理
│       │   ├── errors.py       # 自定义错误处理与异常类
│       │   ├── gaode_api.py    # 高德地图API服务封装
│       │   ├── main.py         # FastAPI 应用主入口与中间件配置
│       │   ├── middlewares.py  # 自定义中间件 (如请求日志、错误处理)
│       │   ├── models.py       # SQLAlchemy 数据库模型定义
│       │   ├── schemas.py      # Pydantic 数据校验与序列化模型
│       │   └── security.py     # 安全相关 (密码哈希、Token生成与验证、API Key验证)
│       ├── .env                # 环境变量文件 (数据库URL, API密钥等 - 不应提交到版本库)
│       ├── .env.example        # 环境变量示例文件
│       ├── import_data.py      # 示例数据导入脚本
│       └── requirements.txt    # 后端Python依赖
├── frontend/                   # 前端 Vue.js 应用目录
│   ├── js/                     # JavaScript 文件
│   ├── static/                 # 静态资源 (CSS)
│   └── index.html              # 前端主入口HTML文件
├── test_api.sh                 # 后端API自动化测试脚本
└── README.md                   # 项目说明文档
```


