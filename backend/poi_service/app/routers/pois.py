from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Path, Security
from sqlalchemy.orm import Session
from app import crud, schemas, models
from app.database import get_db
from app.errors import APIError, ErrorCode
from app.security import get_current_active_user, get_current_admin_user, verify_api_key

router = APIRouter(
    prefix="/pois",
    tags=["POI数据"],
)

# 公众可访问的POI查询接口 
@router.get("/", response_model=schemas.PaginatedResponse)
async def read_pois(
    province: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    has_extension: Optional[bool] = None,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)  # 公众用户通过API密钥访问
):
    """获取POI列表，支持各种过滤条件"""
    offset = (page - 1) * size
    result = crud.get_pois(
        db=db,
        province=province,
        city=city,
        category=category,
        level=level,
        has_extension=has_extension,
        offset=offset,
        limit=size
    )
    
    total_pages = (result["total"] + size - 1) // size if result["total"] > 0 else 1
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "size": size,
        "pages": total_pages
    }

@router.get("/search", response_model=schemas.PaginatedResponse)
async def search_pois(
    q: str = Query(..., description="搜索关键词"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)
):
    """
    通过关键词搜索POI
    """
    offset = (page - 1) * size
    result = crud.search_pois_by_name(
        db=db,
        name_query=q,
        offset=offset,
        limit=size
    )
    
    # 计算总页数
    total_pages = (result["total"] + size - 1) // size if result["total"] > 0 else 1
    
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "size": size,
        "pages": total_pages
    }

@router.post("/bbox", response_model=schemas.PaginatedResponse)
async def get_pois_in_bounding_box(
    bbox: schemas.BoundingBoxQuery,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)
):
    """
    获取指定边界框内的POI
    支持通过q参数搜索特定名称的POI
    支持各种筛选条件
    """
    offset = (page - 1) * size
    result = crud.get_pois_in_bounding_box(
        db=db,
        min_lng=bbox.min_lng,
        min_lat=bbox.min_lat,
        max_lng=bbox.max_lng,
        max_lat=bbox.max_lat,
        q=bbox.q,
        province=bbox.province,
        city=bbox.city,
        category=bbox.category,
        level=bbox.level,
        offset=offset,
        limit=size
    )
    
    # 计算总页数
    total_pages = (result["total"] + size - 1) // size if result["total"] > 0 else 1
    
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "size": size,
        "pages": total_pages
    }

@router.post("/radius", response_model=schemas.PaginatedResponse)
async def get_pois_in_radius(
    radius_query: schemas.RadiusQuery,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)
):
    """
    获取指定半径范围内的POI
    支持通过q参数搜索特定名称的POI
    支持各种筛选条件
    """
    offset = (page - 1) * size
    result = crud.get_pois_in_radius(
        db=db,
        center_lng=radius_query.center_lng,
        center_lat=radius_query.center_lat,
        radius=radius_query.radius,
        q=radius_query.q,
        province=radius_query.province,
        city=radius_query.city,
        category=radius_query.category,
        level=radius_query.level,
        offset=offset,
        limit=size
    )
    
    # 计算总页数
    total_pages = (result["total"] + size - 1) // size if result["total"] > 0 else 1
    
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "size": size,
        "pages": total_pages
    }

@router.get("/{poi_id}", response_model=schemas.POI)
async def read_poi(
    poi_id: int = Path(..., title="POI ID"),
    db: Session = Depends(get_db),
    user: models.User = Depends(verify_api_key)
):
    """
    获取指定POI详情
    """
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if not db_poi:
        raise APIError(
            code=ErrorCode.POI_NOT_FOUND,
            message=f"ID为{poi_id}的POI不存在"
        ).raise_http_exception()
    
    return db_poi

# === 仅内部维护人员可访问的POI管理接口 ===
@router.post("/", response_model=schemas.POI)
async def create_poi(
    poi: schemas.POICreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)  # 必须是内部维护人员
):
    """创建新的POI（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以创建POI"
        ).raise_http_exception()
        
    db_poi = crud.get_poi_by_name(db, name=poi.name)
    if db_poi:
        raise APIError(
            code=ErrorCode.POI_ALREADY_EXISTS,
            message=f"名称为'{poi.name}'的POI已存在"
        ).raise_http_exception()
    
    return crud.create_poi(db=db, poi=poi, user_id=current_user.id)

@router.put("/{poi_id}", response_model=schemas.POI)
async def update_poi(
    poi_id: int,
    poi_update: schemas.POIUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)  # 必须是内部维护人员
):
    """更新指定POI（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以更新POI"
        ).raise_http_exception()
        
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if not db_poi:
        raise APIError(
            code=ErrorCode.POI_NOT_FOUND,
            message=f"ID为{poi_id}的POI不存在"
        ).raise_http_exception()
    
    return crud.update_poi(db=db, poi_id=poi_id, poi_update=poi_update)

@router.delete("/{poi_id}")
async def delete_poi(
    poi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)  # 必须是内部维护人员
):
    """删除指定POI（仅内部维护人员）"""
    if current_user.role != models.UserRole.ADMIN:
        raise APIError(
            code=ErrorCode.PERMISSION_DENIED,
            message="只有内部维护人员可以删除POI"
        ).raise_http_exception()
        
    db_poi = crud.get_poi(db, poi_id=poi_id)
    if not db_poi:
        raise APIError(
            code=ErrorCode.POI_NOT_FOUND,
            message=f"ID为{poi_id}的POI不存在"
        ).raise_http_exception()
    
    crud.delete_poi(db=db, poi_id=poi_id)
    return {"message": f"ID为{poi_id}的POI已成功删除"}