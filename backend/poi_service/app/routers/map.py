from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session
from typing import Optional

from app import crud, models, gaode_api
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import verify_api_key

router = APIRouter(
    prefix="/map",
    tags=["地图服务"],
)

@router.get("/nearby")
async def get_nearby_facilities(
    poi_id: Optional[int] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    keyword: str = "厕所",
    radius: int = Query(1000, ge=100, le=5000),
    types: Optional[str] = None,
    amap_key: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)
):
    """
    获取附近设施
    可以指定POI ID或直接提供经纬度坐标
    """
    # 确定坐标位置
    if poi_id is not None:
        poi = crud.get_poi(db, poi_id)
        if not poi:
            raise APIError(
                code=ErrorCode.POI_NOT_FOUND,
                message=f"ID为{poi_id}的POI不存在"
            ).raise_http_exception()
        latitude = poi.latitude
        longitude = poi.longitude
    elif lat is not None and lng is not None:
        latitude = lat
        longitude = lng
    else:
        raise APIError(
            code=ErrorCode.INVALID_INPUT,
            message="必须提供POI ID或经纬度坐标"
        ).raise_http_exception()
    
    # 调用高德地图API获取附近设施
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
    address: str = Query(..., description="地址"),
    city: Optional[str] = None,
    amap_key: Optional[str] = None,
    user: models.User = Depends(verify_api_key)
):
    """
    地理编码：地址转坐标
    """
    result = await gaode_api.geocode(address, city, amap_key=amap_key)
    return result

@router.get("/regeocode")
async def reverse_geocode(
    lng: float = Query(..., description="经度"),
    lat: float = Query(..., description="纬度"),
    extensions: str = Query("base", description="返回结果控制，base为基本信息，all为详细信息"),
    amap_key: Optional[str] = None,
    user: models.User = Depends(verify_api_key)
):
    """
    逆地理编码：坐标转地址
    """
    result = await gaode_api.reverse_geocode(lng, lat, extensions, amap_key=amap_key)
    return result

@router.get("/route")
async def get_route(
    origin_lng: float = Query(..., description="起点经度"),
    origin_lat: float = Query(..., description="起点纬度"),
    dest_lng: float = Query(..., description="终点经度"),
    dest_lat: float = Query(..., description="终点纬度"),
    mode: str = Query("walking", description="出行方式：walking步行，driving驾车，transit公交，bicycling骑行"),
    amap_key: Optional[str] = None,
    user: models.User = Depends(verify_api_key)
):
    """
    路径规划
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