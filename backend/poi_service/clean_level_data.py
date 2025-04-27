from sqlalchemy import create_engine, text
from app.config import settings
import re

def normalize_level(level):
    if not level:
        return None
        
    # 移除空格和冒号
    level = level.strip().replace(':', '')
    
    # 统一格式
    if level == 'A':
        return '1A'
    elif re.match(r'^[1-5]A$', level):
        return level
    
    # 处理带空格的情况
    level_match = re.match(r'^([1-5]A)\s*$', level)
    if level_match:
        return level_match.group(1)
    
    # 其他情况返回None
    return None

def clean_level_data(engine):
    with engine.begin() as conn:  # 使用事务
        # 获取所有不同的level值
        result = conn.execute(text("SELECT DISTINCT level FROM pois WHERE level IS NOT NULL"))
        unique_levels = [row[0] for row in result]
        
        print("原始的景区等级值:", unique_levels)
        
        # 更新每个不规范的值
        for level in unique_levels:
            normalized = normalize_level(level)
            if normalized != level:
                if normalized is None:
                    print(f"将无效的等级值 '{level}' 设为 NULL")
                    conn.execute(
                        text("UPDATE pois SET level = NULL WHERE level = :level"),
                        {"level": level}
                    )
                else:
                    print(f"将 '{level}' 更正为 '{normalized}'")
                    conn.execute(
                        text("UPDATE pois SET level = :normalized WHERE level = :level"),
                        {"normalized": normalized, "level": level}
                    )
        
        # 验证更新后的结果
        result = conn.execute(text("""
            SELECT level, COUNT(*) as count 
            FROM pois 
            WHERE level IS NOT NULL 
            GROUP BY level 
            ORDER BY count DESC
        """))
        print("\n清理后的景区等级分布:")
        for row in result:
            print(f"{row[0]}: {row[1]}条")

if __name__ == "__main__":
    engine = create_engine(settings.DATABASE_URL)
    clean_level_data(engine)
    print("\n数据清理完成")