import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import pymysql
from typing import List, Optional

app = FastAPI(title="2048 排行榜 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库配置（通过环境变量获取）
# 优先读取 Railway MySQL 插件的变量名（MYSQLHOST等），兼容自定义变量名（DB_HOST等）
DB_HOST = os.environ.get("MYSQLHOST", os.environ.get("DB_HOST", "11.142.154.110"))
DB_PORT = int(os.environ.get("MYSQLPORT", os.environ.get("DB_PORT", "3306")))
DB_NAME = os.environ.get("MYSQLDATABASE", os.environ.get("DB_NAME", "cg40ijiu"))
DB_USER = os.environ.get("MYSQLUSER", os.environ.get("DB_USER", "with_mcawevoknpgtdvhp"))
DB_PASS = os.environ.get("MYSQLPASSWORD", os.environ.get("DB_PASS", "yZA(s5w^a8waWy"))


def get_db():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
    )


# 启动时自动检查并创建表结构
@app.on_event("startup")
async def startup_event():
    print(f"📌 数据库配置: host={DB_HOST}, port={DB_PORT}, db={DB_NAME}, user={DB_USER}")
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS leaderboard (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    player_name VARCHAR(50) NOT NULL UNIQUE,
                    score INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            conn.commit()
        conn.close()
        print("✅ 数据库连接成功，表结构已就绪")
    except Exception as e:
        print(f"⚠️ 数据库连接失败: {e}")
        print("排行榜功能将不可用，但游戏仍可正常运行")


class ScoreSubmit(BaseModel):
    player_name: str
    score: int


class ScoreRecord(BaseModel):
    rank: int
    player_name: str
    score: int
    updated_at: Optional[str] = None


@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    db_ok = False
    try:
        conn = get_db()
        conn.ping()
        conn.close()
        db_ok = True
    except Exception:
        pass
    return {"status": "ok", "database": db_ok}


@app.get("/api/leaderboard", response_model=List[ScoreRecord])
async def get_leaderboard(limit: int = 20):
    """获取排行榜前N名"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT player_name, score, updated_at
                FROM leaderboard
                ORDER BY score DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cursor.fetchall()
        result = []
        for i, row in enumerate(rows):
            result.append(
                ScoreRecord(
                    rank=i + 1,
                    player_name=row["player_name"],
                    score=row["score"],
                    updated_at=str(row["updated_at"]) if row["updated_at"] else None,
                )
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库查询失败: {str(e)}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.post("/api/score")
async def submit_score(data: ScoreSubmit):
    """提交或更新分数（只保留最高分）"""
    if not data.player_name or len(data.player_name.strip()) == 0:
        raise HTTPException(status_code=400, detail="昵称不能为空")
    if len(data.player_name) > 16:
        raise HTTPException(status_code=400, detail="昵称不能超过16个字符")
    if data.score < 0:
        raise HTTPException(status_code=400, detail="分数无效")

    player_name = data.player_name.strip()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            # 查询当前最高分
            cursor.execute(
                "SELECT score FROM leaderboard WHERE player_name = %s", (player_name,)
            )
            existing = cursor.fetchone()
            if existing:
                if data.score > existing["score"]:
                    cursor.execute(
                        "UPDATE leaderboard SET score = %s WHERE player_name = %s",
                        (data.score, player_name),
                    )
                    conn.commit()
                    updated = True
                    best_score = data.score
                else:
                    updated = False
                    best_score = existing["score"]
            else:
                cursor.execute(
                    "INSERT INTO leaderboard (player_name, score) VALUES (%s, %s)",
                    (player_name, data.score),
                )
                conn.commit()
                updated = True
                best_score = data.score

            # 查询当前排名
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM leaderboard WHERE score > %s",
                (best_score,),
            )
            rank_row = cursor.fetchone()
            rank = rank_row["cnt"] + 1

        return {
            "success": True,
            "updated": updated,
            "best_score": best_score,
            "rank": rank,
            "message": f"你的最高分是 {best_score}，当前排名第 {rank} 名",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库操作失败: {str(e)}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.get("/api/player/{player_name}")
async def get_player_score(player_name: str):
    """查询指定玩家的分数和排名"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT player_name, score, updated_at FROM leaderboard WHERE player_name = %s",
                (player_name,),
            )
            row = cursor.fetchone()
            if not row:
                return {"found": False, "player_name": player_name}

            cursor.execute(
                "SELECT COUNT(*) as cnt FROM leaderboard WHERE score > %s",
                (row["score"],),
            )
            rank_row = cursor.fetchone()
            rank = rank_row["cnt"] + 1
        return {
            "found": True,
            "player_name": row["player_name"],
            "score": row["score"],
            "rank": rank,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库查询失败: {str(e)}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


app.mount("/static", StaticFiles(directory="static", html=True), name="static")