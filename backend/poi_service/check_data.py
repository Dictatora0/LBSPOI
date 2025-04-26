from sqlalchemy import create_engine, text
from app.config import settings

# 创建数据库连接
engine = create_engine(settings.DATABASE_URL)

# 执行查询
with engine.connect() as conn:
    # 查询总记录数
    result = conn.execute(text("SELECT COUNT(*) as total FROM pois"))
    total = result.fetchone()[0]
    print(f"数据库中的POI总数: {total}")

    # 查询各省份的记录数
    result = conn.execute(text("""
        SELECT province, COUNT(*) as count 
        FROM pois 
        GROUP BY province 
        ORDER BY count DESC 
        LIMIT 10
    """))
    print("\n前10个省份的POI数量:")
    for row in result:
        print(f"{row[0]}: {row[1]}条")

    # 查询景区等级分布
    result = conn.execute(text("""
        SELECT level, COUNT(*) as count 
        FROM pois 
        GROUP BY level 
        ORDER BY count DESC
    """))
    print("\n景区等级分布:")
    for row in result:
        print(f"{row[0] or '未知'}: {row[1]}条")