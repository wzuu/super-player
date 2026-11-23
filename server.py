"""超级玩家本机服务。使用 Python 标准库和磁盘上的 SQLite 存档。"""

import argparse
from contextlib import closing
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

ROOT = Path(__file__).resolve().parent
LEVELS = json.loads((ROOT / "campaign/levels.json").read_text(encoding="utf-8"))
LEVEL_IDS = [level["id"] for level in LEVELS]
LOOT_PER_LEVEL = 10
PAGE_SIZE = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS battles (
    sequence INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    level TEXT NOT NULL,
    won INTEGER NOT NULL CHECK(won IN (0, 1)),
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
    kills INTEGER NOT NULL CHECK(kills >= 0)
);
CREATE TABLE IF NOT EXISTS battle_loot (
    battle_id TEXT NOT NULL REFERENCES battles(id),
    name TEXT NOT NULL,
    value INTEGER NOT NULL CHECK(value >= 0),
    PRIMARY KEY (battle_id, name)
);
CREATE INDEX IF NOT EXISTS battles_progress ON battles(won, level);
CREATE TABLE IF NOT EXISTS weapon_loadout (
    slot INTEGER PRIMARY KEY CHECK(slot = 1),
    skin TEXT NOT NULL
);
"""


def connect(path):
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def unlocked_levels(db):
    wins = {row["level"] for row in db.execute("SELECT DISTINCT level FROM battles WHERE won = 1")}
    levels = []
    for level in LEVELS:
        level_id = level["id"]
        cleared = level_id in wins
        levels.append({**level, "cleared": cleared, "unlocked": not levels or levels[-1]["cleared"]})
    return levels


def history(db, before):
    rows = db.execute(
        """
        SELECT b.sequence, b.id, b.level, b.won, b.ended_at AS endedAt,
               b.duration_ms AS durationMs, b.kills,
               COUNT(l.name) AS lootCount, COALESCE(SUM(l.value), 0) AS lootValue
        FROM (SELECT * FROM battles WHERE sequence < ? ORDER BY sequence DESC LIMIT ?) b
        LEFT JOIN battle_loot l ON l.battle_id = b.id
        GROUP BY b.sequence ORDER BY b.sequence DESC
        """, (before, PAGE_SIZE + 1)
    ).fetchall()
    return {
        "battles": [dict(row) for row in rows[:PAGE_SIZE]],
        "nextBefore": rows[PAGE_SIZE - 1]["sequence"] if len(rows) > PAGE_SIZE else None,
    }


def progress(db):
    db.execute("BEGIN")
    return {
        "levels": unlocked_levels(db),
        **weapon_loadout(db),
        "lootPerLevel": LOOT_PER_LEVEL,
        "battleCount": db.execute("SELECT COUNT(*) FROM battles").fetchone()[0],
        "loot": [dict(row) for row in db.execute(
            """
            SELECT b.level, l.name, MAX(l.value) AS value, COUNT(*) AS count,
                   MIN(b.ended_at) AS firstAt
            FROM battle_loot l JOIN battles b ON b.id = l.battle_id
            GROUP BY b.level, l.name ORDER BY firstAt, l.name
            """
        )],
        **history(db, 2**63 - 1),
    }


def weapon_loadout(db):
    row = db.execute(
        """
        SELECT skin FROM weapon_loadout WHERE slot = 1
        AND EXISTS (SELECT 1 FROM battles WHERE won = 1 AND level = skin)
        """
    ).fetchone()
    return {"equippedSkin": row["skin"] if row and row["skin"] in LEVEL_IDS else None}


def save_loadout(db, data):
    if not isinstance(data, dict) or set(data) != {"skin"}:
        raise ValueError("武器外观设置无效")
    skin = data["skin"]
    if skin is not None and skin not in LEVEL_IDS:
        raise ValueError("武器外观不存在")
    with db:
        db.execute("BEGIN IMMEDIATE")
        if skin is None:
            db.execute("DELETE FROM weapon_loadout WHERE slot = 1")
        else:
            if not db.execute("SELECT 1 FROM battles WHERE level = ? AND won = 1", (skin,)).fetchone():
                raise PermissionError("通关对应关卡后才能佩戴")
            db.execute(
                "INSERT INTO weapon_loadout VALUES (1, ?) ON CONFLICT(slot) DO UPDATE SET skin = excluded.skin",
                (skin,),
            )
    return {"equippedSkin": skin}


def whole_number(value, minimum=0, maximum=2**53 - 1):
    return type(value) is int and minimum <= value <= maximum


def validate_battle(data):
    if not isinstance(data, dict):
        raise ValueError("对战记录格式无效")
    battle_id = str(UUID(data.get("id", "")))
    level = data.get("level")
    won = data.get("won")
    kills = data.get("kills")
    ended_at = data.get("endedAt")
    duration_ms = data.get("durationMs")
    items = data.get("loot")
    if (
        level not in LEVEL_IDS or type(won) is not bool or not whole_number(kills)
        or not whole_number(ended_at, 1, 8_640_000_000_000_000) or not whole_number(duration_ms)
        or not isinstance(items, list) or len(items) > LOOT_PER_LEVEL
        or (not won and items)
    ):
        raise ValueError("对战记录无效")
    loot = {}
    for item in items:
        name = item.get("name") if isinstance(item, dict) else None
        if (not isinstance(name, str) or not name.strip() or len(name) > 100
                or name in loot or not whole_number(item.get("value"), maximum=1_000_000)):
            raise ValueError("战利品记录无效")
        loot[name] = item["value"]
    return battle_id, level, won, ended_at, duration_ms, kills, loot


def save_battle(db, battle):
    battle_id, level, won, ended_at, duration_ms, kills, loot = battle
    position = LEVEL_IDS.index(level)
    # 并行请求也在同一事务中检查前置关卡、写入对战与战利品。
    with db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT level, won FROM battles WHERE id = ?", (battle_id,)).fetchone()
        if existing:
            position = LEVEL_IDS.index(existing["level"])
            won = existing["won"]
        else:
            if not unlocked_levels(db)[position]["unlocked"]:
                raise PermissionError("请先通关上一关")
            db.execute(
                "INSERT INTO battles (id, level, won, ended_at, duration_ms, kills) VALUES (?, ?, ?, ?, ?, ?)",
                (battle_id, level, won, ended_at, duration_ms, kills),
            )
            db.executemany(
                "INSERT INTO battle_loot (battle_id, name, value) VALUES (?, ?, ?)",
                ((battle_id, name, value) for name, value in loot.items()),
            )
    next_level = LEVELS[position + 1] if won and position + 1 < len(LEVELS) else None
    return {"nextLevel": next_level, "campaignCleared": bool(won and next_level is None)}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".js": "text/javascript"}

    def local_host(self):
        host = self.headers.get("Host")
        port = self.server.server_port
        return host if host in {f"127.0.0.1:{port}", f"localhost:{port}"} else None

    def do_GET(self):
        self.read_request(head=False)

    def do_HEAD(self):
        self.read_request(head=True)

    def read_request(self, head):
        if not self.local_host():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        parts = urlsplit(self.path)
        path = parts.path
        if path in {"/api/progress", "/api/battles", "/api/loadout"}:
            try:
                with closing(connect(self.server.database)) as db:
                    if path == "/api/progress":
                        result = progress(db)
                    elif path == "/api/loadout":
                        result = weapon_loadout(db)
                    else:
                        before = int(parse_qs(parts.query).get("before", [2**63 - 1])[0])
                        if not 1 <= before <= 2**63 - 1:
                            raise ValueError
                        result = history(db, before)
                self.json_response(HTTPStatus.OK, result, head)
            except ValueError:
                self.json_response(HTTPStatus.BAD_REQUEST, {"error": "无效的记录分页"}, head)
            except sqlite3.Error as error:
                self.log_error("%s", error)
                self.json_response(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "无法读取本机存档"}, head)
            return

        # 只开放游戏入口、静态素材和开发预览。存档目录和项目文档不由 HTTP 分发。
        segment = path.strip("/").split("/")
        level = segment[0]
        if path in {"/", "/index.html"}:
            file = ROOT / "index.html"
        elif level in LEVEL_IDS and path in {f"/{level}", f"/{level}/", f"/{level}/index.html"}:
            try:
                with closing(connect(self.server.database)) as db:
                    unlocked = unlocked_levels(db)[LEVEL_IDS.index(level)]["unlocked"]
            except sqlite3.Error as error:
                self.log_error("%s", error)
                self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "Save unavailable")
                return
            if not unlocked:
                self.redirect(f"/?locked={level}#missions")
                return
            if path == f"/{level}":
                self.redirect(f"/{level}/")
                return
            file = ROOT / level / "index.html"
        elif path in {"/campaign/home.css", "/campaign/home.mjs", "/campaign/save.mjs", "/campaign/weapon-preview.mjs",
                      "/campaign/levels.json",
                      "/level-kit/preview.html", "/level-kit/vendor/three-r160.js",
                      "/level-kit/starter/scene.mjs"}:
            file = ROOT.joinpath(*segment)
        elif (
            len(segment) == 3 and segment[:2] == ["campaign", "images"]
            and segment[2] in {f"{level_id}.webp" for level_id in LEVEL_IDS}
        ) or (
            len(segment) == 3 and segment[:2] == ["level-kit", "src"] and segment[2].endswith(".mjs")
        ) or (
            len(segment) == 2 and level in LEVEL_IDS and segment[1] == "scene.mjs"
        ):
            file = ROOT.joinpath(*segment)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not file.is_file() or ROOT not in file.resolve().parents:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.static_file = file
        super().do_HEAD() if head else super().do_GET()

    def translate_path(self, path):
        return str(self.static_file)

    def redirect(self, location):
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.path not in {"/api/battles", "/api/loadout"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        host = self.local_host()
        if not host or self.headers.get("Origin") != f"http://{host}":
            self.json_response(HTTPStatus.FORBIDDEN, {"error": "请从本机游戏页面保存"})
            return
        try:
            if self.headers.get_content_type() != "application/json":
                raise ValueError("请提交 JSON 数据")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 16_384:
                raise ValueError("请求大小无效")
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            with closing(connect(self.server.database)) as db:
                result = save_battle(db, validate_battle(data)) if self.path == "/api/battles" else save_loadout(db, data)
            self.json_response(HTTPStatus.OK, result)
        except (ValueError, TypeError, AttributeError) as error:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except PermissionError as error:
            self.json_response(HTTPStatus.FORBIDDEN, {"error": str(error)})
        except sqlite3.Error as error:
            self.log_error("%s", error)
            self.json_response(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "无法写入本机存档"})

    def json_response(self, status, data, head=False):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="启动超级玩家本机服务")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=ROOT / ".data" / "super-player.sqlite3")
    options = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", options.port), Handler) as server:
        server.database = options.db.resolve()
        server.database.parent.mkdir(parents=True, exist_ok=True)
        with closing(connect(server.database)) as db:
            db.executescript(SCHEMA)
        print(f"超级玩家 http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
