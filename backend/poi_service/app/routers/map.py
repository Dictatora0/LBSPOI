from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session
from typing import Optional

from app import crud, models, gaode_api
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import verify_api_key

# 创建地图服务相关的路由
# 这些路由集成了高德地图的API，为前端提供地图相关功能
# prefix: 所有路由都会自动带有"/map"前缀
# tags: 用于API文档分组
router = APIRouter(
    prefix="/map",
    tags=["地图服务"],
)

@router.get("/nearby")
async def get_nearby_facilities(
    poi_id: Optional[int] = None,  # POI的ID，用于确定中心点
    lat: Optional[float] = None,   # 中心点纬度，如果未提供poi_id
    lng: Optional[float] = None,   # 中心点经度，如果未提供poi_id
    keyword: str = "厕所",         # 搜索关键词，默认为"厕所"
    radius: int = Query(1000, ge=100, le=5000),  # 搜索半径(米)，默认1000米，最小100米，最大5000米
    types: Optional[str] = None,   # 设施类型编码，参考高德地图POI分类编码表
    amap_key: Optional[str] = None,  # 高德地图API密钥，如果不提供则使用系统默认值
    db: Session = Depends(get_db),  # 数据库会话
    user: models.User = Depends(verify_api_key)  # API密钥认证
):
    """
    获取附近设施
    
    根据提供的位置（通过POI ID或直接指定经纬度坐标），
    从高德地图API获取指定半径范围内的设施信息。
    
    可用于查找附近的厕所、餐厅、ATM等服务设施。
    需要API密钥认证。
    """
    # 确定中心坐标位置
    # 优先使用POI ID查找位置，如果未提供，则使用直接提供的经纬度
    if poi_id is not None:
        # 从数据库获取POI信息
        poi = crud.get_poi(db, poi_id)
        if not poi:
            raise APIError(
                code=ErrorCode.POI_NOT_FOUND,
                message=f"ID为{poi_id}的POI不存在"
            ).raise_http_exception()
        # 使用POI的坐标
        latitude = poi.latitude
        longitude = poi.longitude
    elif lat is not None and lng is not None:
        # 直接使用提供的坐标
        latitude = lat
        longitude = lng
    else:
        # 如果两种方式都未提供，则报错
        raise APIError(
            code=ErrorCode.INVALID_INPUT,
            message="必须提供POI ID或经纬度坐标"
        ).raise_http_exception()
    
    # 调用高德地图API获取附近设施
    # gaode_api模块封装了对高德地图API的调用
    result = await gaode_api.get_nearby_facilities(
        latitude=latitude,
        longitude=longitude,
        keyword=keyword,
        radius=radius,
        types=types,
        amap_key=amap_key
    )
    return result

@router.get("/geocode")
async def geocode_address(
    address: str = Query(..., description="地址"),  # 要转换的地址文本，必填
    city: Optional[str] = None,                   # 地址所在城市，提供可提高精度
    amap_key: Optional[str] = None,               # 高德地图API密钥
    user: models.User = Depends(verify_api_key)   # API密钥认证
):
    """
    地理编码：地址转坐标
    
    将文本地址转换为地理坐标（经纬度）。
    如果提供城市名称，可以提高地址解析的准确性。
    
    常用于用户输入地址后定位到地图上的场景。
    需要API密钥认证。
    """
    result = await gaode_api.geocode(address, city, amap_key=amap_key)
    return result

@router.get("/regeocode")
async def reverse_geocode(
    lng: float = Query(..., description="经度"),  # 经度坐标，必填
    lat: float = Query(..., description="纬度"),  # 纬度坐标，必填
    extensions: str = Query("base", description="返回结果控制，base为基本信息，all为详细信息"),  # 结果详细程度控制
    amap_key: Optional[str] = None,               # 可选：高德地图API密钥
    user: models.User = Depends(verify_api_key)   # API密钥认证
):
    """
    逆地理编码：坐标转地址
    
    将地理坐标（经纬度）转换为结构化地址信息。
    extensions参数控制返回结果的详细程度：
    - "base": 返回基本地址信息
    - "all": 返回包含道路、兴趣点等详细信息
    
    常用于用户在地图上点击位置后获取地址的场景。
    需要API密钥认证。
    """
    result = await gaode_api.reverse_geocode(lng, lat, extensions, amap_key=amap_key)
    return result

@router.get("/route")
async def get_route(
    origin_lng: float = Query(..., description="起点经度"),  # 起点经度，必填
    origin_lat: float = Query(..., description="起点纬度"),  # 起点纬度，必填
    dest_lng: float = Query(..., description="终点经度"),    # 终点经度，必填
    dest_lat: float = Query(..., description="终点纬度"),    # 终点纬度，必填
    mode: str = Query("walking", description="出行方式：walking步行，driving驾车，transit公交，bicycling骑行"),  # 路线规划模式
    amap_key: Optional[str] = None,                        # 高德地图API密钥
    user: models.User = Depends(verify_api_key)            # API密钥认证
):
    """
    路径规划
    
    计算从起点到终点的路线，支持多种出行方式：
    - walking: 步行路线（默认）
    - driving: 驾车路线
    - transit: 公共交通路线
    - bicycling: 骑行路线
    
    返回包含路线详情、距离、预计时间等信息的结构化数据。
    常用于导航和行程规划场景。
    需要API密钥认证。
    """
    result = await gaode_api.get_route(
        origin_longitude=origin_lng,
        origin_latitude=origin_lat,
        destination_longitude=dest_lng,
        destination_latitude=dest_lat,
        mode=mode,
        amap_key=amap_key
    )
    return result