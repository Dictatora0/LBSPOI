# 高德 API 封装

import httpx
from typing import Optional, Dict, Any
from app.config import settings
from app.errors import APIError, ErrorCode

# 高德地图API基础URL
GAODE_API_BASE_URL = "https://restapi.amap.com/v3"

async def _make_request(endpoint: str, params: Dict[str, Any]) -> Dict:
    """发送请求到高德地图API"""
    try:
        # 添加API密钥到参数
        params["key"] = settings.GAODE_API_KEY
        
        # 发送请求并确保响应使用UTF-8编码
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GAODE_API_BASE_URL}/{endpoint}",
                params=params,
                headers={"Accept-Charset": "utf-8"}
            )
            response.encoding = "utf-8"
            
            # 解析响应
            data = response.json()
            
            # 检查API响应状态
            if data.get("status") != "1":
                raise APIError(
                    code=ErrorCode.MAP_SERVICE_ERROR,
                    message=data.get("info", "高德地图API调用失败"),
                    details={"error": data}
                )
            
            return data
            
    except httpx.RequestError as e:
        raise APIError(
            code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="无法连接到高德地图服务",
            details={"error": str(e)}
        )
    except Exception as e:
        raise APIError(
            code=ErrorCode.UNKNOWN_ERROR,
            message="处理高德地图API响应时发生错误",
            details={"error": str(e)}
        )

async def get_nearby_facilities(
    latitude: float,
    longitude: float,
    keyword: str,
    radius: int = 1000,
    types: Optional[str] = None
) -> Dict:
    """查询周边设施"""
    params = {
        "location": f"{longitude},{latitude}",
        "keywords": keyword,
        "radius": radius,
        "output": "json",
        "extensions": "all"
    }
    
    if types:
        params["types"] = types
        
    return await _make_request("place/around", params)

async def geocode(
    address: str, 
    city: Optional[str] = None
) -> Dict[str, Any]:
    """
    将地址转换为坐标
    :param address: 结构化地址
    :param city: 指定查询的城市
    :return: 地理编码结果
    """
    params = {
        "address": address,
        "output": "json"
    }
    
    if city:
        params["city"] = city
        
    return await _make_request("geocode/geo", params)

async def reverse_geocode(
    longitude: float, 
    latitude: float, 
    extensions: str = "base"
) -> Dict[str, Any]:
    """
    将坐标转换为地址
    :param longitude: 经度
    :param latitude: 纬度
    :param extensions: 返回结果控制，base为基本信息，all为详细信息
    :return: 逆地理编码结果
    """
    params = {
        "location": f"{longitude},{latitude}",
        "extensions": extensions,
        "output": "json"
    }
    
    data = await _make_request("geocode/regeo", params)
    return data.get("regeocode", {})

async def get_route(
    origin_longitude: float,
    origin_latitude: float,
    destination_longitude: float,
    destination_latitude: float,
    mode: str = "walking"  # walking, driving, transit, bicycling
) -> Dict[str, Any]:
    """
    获取路径规划
    :param origin_longitude: 起点经度
    :param origin_latitude: 起点纬度
    :param destination_longitude: 终点经度
    :param destination_latitude: 终点纬度
    :param mode: 出行方式，walking步行，driving驾车，transit公交，bicycling骑行
    :return: 路径规划结果
    """
    params = {
        "origin": f"{origin_longitude},{origin_latitude}",
        "destination": f"{destination_longitude},{destination_latitude}",
        "output": "json"
    }
    
    data = await _make_request(f"direction/{mode}", params)
    
    # 不同的模式返回不同结构的数据
    if mode == "walking":
        return data.get("route", {}).get("paths", [{}])[0]
    elif mode == "driving":
        return data.get("route", {}).get("paths", [{}])[0]
    elif mode == "transit":
        return data.get("route", {}).get("transits", [{}])[0]
    elif mode == "bicycling":
        return data.get("data", {}).get("paths", [{}])[0]
    else:
        return data
