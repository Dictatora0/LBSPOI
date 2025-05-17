#!/bin/bash

# API 测试脚本
# 该脚本会尝试在后台启动后端服务，然后执行测试。
# 运行之前确保:
# - 您位于项目根目录下 (LBSPOI)
# - jq 已安装用于格式化JSON输出
# - 'tempadmin' 用户 (密码: password123) 已存在于数据库且为管理员角色
# - backend/poi_service/.env 文件中 GAODE_API_KEY 已正确设置

BASE_URL="http://localhost:8080/api"
JQ_CMD="jq" # 如果jq不在PATH中，请修改为绝对路径
BACKEND_DIR="backend/poi_service"
UVICORN_LOG_FILE="uvicorn_test_run.log"

echo "尝试启动后端服务..."
# 进入后端目录，在后台启动uvicorn，并将日志输出到文件
cd "$BACKEND_DIR" || { echo "错误: 无法进入后端目录 $BACKEND_DIR"; exit 1; }
uvicorn app.main:app --reload --port 8080 > "../$UVICORN_LOG_FILE" 2>&1 &
UVICORN_PID=$!
cd - > /dev/null # 返回之前的目录

echo "后端服务已在后台启动 (PID: $UVICORN_PID)。日志文件: $BACKEND_DIR/$UVICORN_LOG_FILE"
echo "等待几秒钟让服务完全启动..."
sleep 5 # 等待服务启动

# 函数：在脚本退出时尝试停止后台的uvicorn服务
cleanup() {
    echo "清理: 正在尝试停止后端服务 (PID: $UVICORN_PID)..."
    kill $UVICORN_PID
    wait $UVICORN_PID 2>/dev/null
    echo "后端服务已停止。"
    # 可以选择删除日志文件
    # rm -f "$BACKEND_DIR/$UVICORN_LOG_FILE"
}
trap cleanup EXIT # 注册cleanup函数，在脚本退出时执行

# 函数：执行并打印curl命令和结果
run_test() {
    DESCRIPTION=$1
    COMMAND=$2
    echo "-----------------------------------------------------"
    echo "测试: $DESCRIPTION"
    echo "命令: $COMMAND"
    echo "结果:"
    eval "$COMMAND" # 使用eval来正确处理变量和引号
    echo "-----------------------------------------------------"
    echo ""
    sleep 1 # 短暂暂停，避免请求过于频繁
}

# --- 0. 准备工作：获取管理员Token (用于可能的清理和后续管理员操作) ---
echo "准备工作: 获取 'tempadmin' 的管理员Token..."
ADMIN_LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=tempadmin&password=password123")

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN_RESPONSE" | $JQ_CMD -r .access_token)

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
    echo "错误:未能获取 'tempadmin' 的管理员Token。请确保 'tempadmin' 用户存在，密码正确，且为管理员。"
    echo "响应: $ADMIN_LOGIN_RESPONSE"
    # exit 1 # 可以选择在这里退出，或者允许脚本继续测试非管理员部分
else
    echo "'tempadmin' 管理员Token获取成功。"
fi
echo ""

# --- 1. 用户注册与登录 ---
TEST_USERNAME="testrunner_$(date +%s)" # 使用时间戳确保用户名唯一性
TEST_EMAIL="${TEST_USERNAME}@example.com"
TEST_PASSWORD="password123"

run_test "用户注册 ($TEST_USERNAME)" \
    "curl -s -X POST '$BASE_URL/auth/register' \
        -H 'Content-Type: application/json' \
        -d '{\"username\":\"$TEST_USERNAME\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}' | $JQ_CMD"

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$TEST_USERNAME&password=$TEST_PASSWORD")

USER_TOKEN=$(echo "$LOGIN_RESPONSE" | $JQ_CMD -r .access_token)
if [ "$USER_TOKEN" == "null" ] || [ -z "$USER_TOKEN" ]; then
    echo "错误: $TEST_USERNAME 用户登录失败。"
    echo "响应: $LOGIN_RESPONSE"
    USER_TOKEN="" # 确保后续依赖USER_TOKEN的测试不会因非法Token出错
else
    echo "$TEST_USERNAME 用户登录成功。"
fi
echo ""

# --- 2. 用户个人信息与API密钥 (使用 $USER_TOKEN) ---
if [ -n "$USER_TOKEN" ]; then
    run_test "获取当前用户信息 ($TEST_USERNAME)" \
        "curl -s -X GET '$BASE_URL/users/me' \
            -H 'Authorization: Bearer $USER_TOKEN' | $JQ_CMD"

    run_test "更新当前用户信息 ($TEST_USERNAME) - 更改邮箱" \
        "curl -s -X PUT '$BASE_URL/users/me' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -H 'Content-Type: application/json' \
            -d '{\"email\":\"${TEST_USERNAME}_updated@example.com\"}' | $JQ_CMD"

    APIKEY_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/apikey" \
        -H "Authorization: Bearer $USER_TOKEN")
    USER_API_KEY=$(echo "$APIKEY_RESPONSE" | $JQ_CMD -r .key)

    if [ "$USER_API_KEY" == "null" ] || [ -z "$USER_API_KEY" ]; then
        echo "错误: $TEST_USERNAME未能创建API Key。"
        echo "响应: $APIKEY_RESPONSE"
        USER_API_KEY=""
    else
        echo "$TEST_USERNAME API Key创建成功: $USER_API_KEY"
        run_test "获取用户 ($TEST_USERNAME) 的API密钥列表" \
            "curl -s -X GET '$BASE_URL/auth/apikeys' \
                -H 'Authorization: Bearer $USER_TOKEN' | $JQ_CMD"
    fi
else
    echo "跳过需要用户Token的测试，因为 $TEST_USERNAME 登录失败。"
fi
echo ""

# --- 3. POI公开查询 (使用 $USER_API_KEY) ---
if [ -n "$USER_API_KEY" ]; then
    run_test "获取POI列表 (第一页)" \
        "curl -s -X GET '$BASE_URL/pois/?page=1&size=2' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"

    run_test "按省份查询POI (北京市)" \
        "curl -s -G '$BASE_URL/pois/' --data-urlencode 'province=北京市' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"
    
    run_test "按名称搜索POI (公园)" \
        "curl -s -G '$BASE_URL/pois/search' --data-urlencode 'q=公园' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"

    run_test "按BBOX查询POI" \
        "curl -s -X POST '$BASE_URL/pois/bbox' \
            -H 'X-API-KEY: $USER_API_KEY' \
            -H 'Content-Type: application/json' \
            -d '{\"min_lng\":116.0, \"min_lat\":39.0, \"max_lng\":117.0, \"max_lat\":40.0, \"q\":\"故宫\"}' | $JQ_CMD"

    run_test "按半径查询POI" \
        "curl -s -X POST '$BASE_URL/pois/radius' \
            -H 'X-API-KEY: $USER_API_KEY' \
            -H 'Content-Type: application/json' \
            -d '{\"center_lng\":116.3974, \"center_lat\":39.9175, \"radius\":1000, \"q\":\"故宫\"}' | $JQ_CMD"
    
    # 假设存在一个POI ID为181 (中山公园) 用于测试详情获取
    KNOWN_POI_ID_FOR_GET="181"
    run_test "获取特定POI详情 (ID: $KNOWN_POI_ID_FOR_GET)" \
        "curl -s -X GET '$BASE_URL/pois/$KNOWN_POI_ID_FOR_GET' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"
else
    echo "跳过需要API Key的POI查询测试，因为未能创建API Key。"
fi
echo ""

# --- 4. 地图服务API (使用 $USER_API_KEY) ---
if [ -n "$USER_API_KEY" ]; then
    echo "测试地图服务API (依赖于.env中的GAODE_API_KEY)..."
    # 假设存在一个POI ID为181 (中山公园) 用于测试附近查询
    run_test "获取附近设施 (餐馆, POI ID: $KNOWN_POI_ID_FOR_GET)" \
        "curl -s -G '$BASE_URL/map/nearby' --data-urlencode 'poi_id=$KNOWN_POI_ID_FOR_GET' --data-urlencode 'keyword=餐馆' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"

    run_test "地理编码 (北京市故宫博物院)" \
        "curl -s -G '$BASE_URL/map/geocode' --data-urlencode 'address=北京市故宫博物院' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"
    
    # 使用一个已知的北京坐标
    run_test "逆地理编码 (116.3974, 39.9175)" \
        "curl -s -G '$BASE_URL/map/regeocode' --data-urlencode 'lng=116.3974' --data-urlencode 'lat=39.9175' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"

    run_test "路径规划 (步行, 天安门到故宫)" \
        "curl -s -G '$BASE_URL/map/route' \
            --data-urlencode 'origin_lng=116.397455' --data-urlencode 'origin_lat=39.909187' \
            --data-urlencode 'dest_lng=116.3974' --data-urlencode 'dest_lat=39.9175' \
            --data-urlencode 'mode=walking' \
            -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD"
else
    echo "跳过地图服务API测试，因为未能创建API Key。"
fi
echo ""


# --- 5. 管理员操作 (使用 $ADMIN_TOKEN) ---
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    echo "执行管理员权限测试 (使用 'tempadmin' 的Token)..."

    # 5.1 POI管理
    ADMIN_POI_NAME="脚本测试POI_$(date +%s)"
    CREATE_POI_RESPONSE=$(curl -s -X POST "$BASE_URL/pois/" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$ADMIN_POI_NAME\",\"province\":\"脚本省\",\"city\":\"脚本市\",\"category\":\"测试\",\"level\":\"1A\",\"longitude\":120.0,\"latitude\":30.0,\"description\":\"脚本创建的POI\",\"extension\":{\"phone\":\"12300001111\"}}")
    
    echo "创建POI ($ADMIN_POI_NAME) 结果:"
    echo "$CREATE_POI_RESPONSE" | $JQ_CMD
    echo ""
    
    CREATED_POI_ID=$(echo "$CREATE_POI_RESPONSE" | $JQ_CMD -r .id)

    if [ "$CREATED_POI_ID" != "null" ] && [ -n "$CREATED_POI_ID" ]; then
        run_test "更新刚创建的POI (ID: $CREATED_POI_ID)" \
            "curl -s -X PUT '$BASE_URL/pois/$CREATED_POI_ID' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' \
                -H 'Content-Type: application/json' \
                -d '{\"name\":\"${ADMIN_POI_NAME}_已更新\",\"description\":\"描述已通过脚本更新\",\"extension\":{\"phone\":\"12300002222\",\"website\":\"http://script.example.com\"}}' | $JQ_CMD"
        
        run_test "删除刚创建的POI (ID: $CREATED_POI_ID)" \
            "curl -s -X DELETE '$BASE_URL/pois/$CREATED_POI_ID' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' | $JQ_CMD"
        
        run_test "验证POI (ID: $CREATED_POI_ID) 是否已删除 (应返回404或错误)" \
            "curl -s -X GET '$BASE_URL/pois/$CREATED_POI_ID' \
                -H 'X-API-KEY: $USER_API_KEY' | $JQ_CMD" # 使用普通用户API Key验证
    else
        echo "未能从创建POI响应中获取ID，跳过更新和删除测试。"
    fi

    # 5.2 用户管理
    # 假设 $TEST_USERNAME (ID需要动态获取) 是我们要管理的用户
    # 首先，需要获取 $TEST_USERNAME 的用户ID
    GET_USERS_RESPONSE=$(curl -s -X GET "$BASE_URL/users/?limit=1000" -H "Authorization: Bearer $ADMIN_TOKEN") # 假设用户不多于1000
    MANAGED_USER_ID=$(echo "$GET_USERS_RESPONSE" | $JQ_CMD --arg username "$TEST_USERNAME" '.[] | select(.username == $username) | .id')

    if [ "$MANAGED_USER_ID" != "null" ] && [ -n "$MANAGED_USER_ID" ]; then
        echo "获取到测试用户 $TEST_USERNAME 的ID为: $MANAGED_USER_ID"
        
        run_test "获取用户 $TEST_USERNAME (ID: $MANAGED_USER_ID) 的详细信息" \
            "curl -s -X GET '$BASE_URL/users/$MANAGED_USER_ID' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' | $JQ_CMD"

        run_test "更新用户 $TEST_USERNAME (ID: $MANAGED_USER_ID) 角色为 admin" \
            "curl -s -X PUT '$BASE_URL/users/$MANAGED_USER_ID/role' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' \
                -H 'Content-Type: application/json' \
                -d '{\"role\":\"admin\"}' | $JQ_CMD"

        run_test "禁用用户 $TEST_USERNAME (ID: $MANAGED_USER_ID)" \
            "curl -s -X PUT '$BASE_URL/users/$MANAGED_USER_ID/status' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' \
                -H 'Content-Type: application/json' \
                -d '{\"is_active\":false}' | $JQ_CMD"
        
        run_test "尝试使用已禁用的 $TEST_USERNAME 登录 (应失败)" \
            "curl -s -X POST '$BASE_URL/auth/token' \
                -H 'Content-Type: application/x-www-form-urlencoded' \
                -d 'username=$TEST_USERNAME&password=$TEST_PASSWORD' | $JQ_CMD"

        run_test "重新启用用户 $TEST_USERNAME (ID: $MANAGED_USER_ID)" \
            "curl -s -X PUT '$BASE_URL/users/$MANAGED_USER_ID/status' \
                -H 'Authorization: Bearer $ADMIN_TOKEN' \
                -H 'Content-Type: application/json' \
                -d '{\"is_active\":true}' | $JQ_CMD"
    else
        echo "未能获取测试用户 $TEST_USERNAME 的ID，跳过部分用户管理测试。"
    fi

    # 5.3 清理测试用户 $TEST_USERNAME
    # 删除用户API端点未在您的路由中定义，通常不直接通过API删除用户，而是禁用。
    # 如果需要，可以添加禁用 $TEST_USERNAME 的逻辑。
    # 或者通过管理员Token停用其API Key (如果之前创建成功)
    if [ -n "$USER_API_KEY" ]; then
         run_test "停用测试用户 ($TEST_USERNAME) 的API密钥 ($USER_API_KEY)" \
            "curl -s -X DELETE '$BASE_URL/auth/apikeys/$USER_API_KEY' \
                -H 'Authorization: Bearer $USER_TOKEN' | $JQ_CMD" # 注意：停用自己的API Key是用自己的Token
    fi

else
    echo "跳过管理员权限测试，因为 'tempadmin' 的Token未能获取。"
fi

echo ""
echo "所有测试执行完毕。" 