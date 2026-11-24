"""超级玩家本机服务。使用 Python 标准库和磁盘上的 SQLite 存档。"""

import argparse
from contextlib import closing
from http.cookies import CookieError, SimpleCookie
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
WEAPON_UNLOCKS = {**{level: level for level in LEVEL_IDS}, "shotgun-pump": "rain-city", "shotgun-forge": "brass-factory"}
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
CREATE INDEX IF NOT EXISTS battles_history ON battles(ended_at DESC, sequence DESC);
CREATE INDEX IF NOT EXISTS battles_progress ON battles(won, level);
CREATE TABLE IF NOT EXISTS battle_reports (
    battle_id TEXT PRIMARY KEY REFERENCES battles(id), detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS battle_replays (
    battle_id TEXT PRIMARY KEY REFERENCES battles(id), replay TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secret_rooms (
    level TEXT PRIMARY KEY, claimed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quartermaster (
    slot INTEGER PRIMARY KEY CHECK(slot=1), revision INTEGER NOT NULL, state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_purchases (
    id TEXT PRIMARY KEY
);
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
    # 游标仍为上一页末行的序号，已存在的客户端可继续翻页。
    anchor = db.execute("SELECT ended_at FROM battles WHERE sequence = ?", (before,)).fetchone()
    if anchor:
        boundary = "WHERE (ended_at, sequence) < (?, ?)"
        params = (anchor["ended_at"], before)
    else:
        boundary = "WHERE sequence < ?"
        params = (before,)
    rows = db.execute(
        f"""
        SELECT b.sequence, b.id, b.level, b.won, b.ended_at AS endedAt,
               b.duration_ms AS durationMs, b.kills,
               COUNT(l.name) AS lootCount, COALESCE(SUM(l.value), 0) AS lootValue
        FROM (SELECT * FROM battles {boundary} ORDER BY ended_at DESC, sequence DESC LIMIT ?) b
        LEFT JOIN battle_loot l ON l.battle_id = b.id
        GROUP BY b.sequence ORDER BY b.ended_at DESC, b.sequence DESC
        """, (*params, PAGE_SIZE + 1)
    ).fetchall()
    return {
        "battles": [dict(row) for row in rows[:PAGE_SIZE]],
        "nextBefore": rows[PAGE_SIZE - 1]["sequence"] if len(rows) > PAGE_SIZE else None,
    }


def progress(db):
    db.execute("BEGIN")
    return {
        "levels": unlocked_levels(db),
        "best": {row["level"]: dict(row) for row in db.execute("""
            SELECT level, MAX(kills) AS kills, MIN(CASE WHEN won THEN duration_ms END) AS time,
                   MAX((SELECT COUNT(*) FROM battle_loot WHERE battle_id=battles.id)) AS loot
            FROM battles GROUP BY level
        """)},
        **weapon_loadout(db),
        "lootPerLevel": LOOT_PER_LEVEL,
        "discoveries": [row[0] for row in db.execute("SELECT level FROM secret_rooms ORDER BY level")],
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


def gear_snapshot(db):
    row = db.execute("SELECT revision, state FROM quartermaster WHERE slot=1").fetchone()
    return {"revision": row["revision"] if row else 0, "state": json.loads(row["state"]) if row else {},
            "earned": db.execute("SELECT COALESCE(SUM(value),0) FROM battle_loot").fetchone()[0],
            "cleared": [level["id"] for level in unlocked_levels(db) if level["cleared"]]}


def write_gear(db, data):
    if isinstance(data, dict) and set(data) == {"acknowledgePurchase"}:
        receipt = str(UUID(str(data["acknowledgePurchase"])))
        with db:
            db.execute("DELETE FROM pending_purchases WHERE id=?", (receipt,))
        return {"saved": True}
    if not isinstance(data, dict) or not whole_number(data.get("revision")) or not isinstance(data.get("state"), dict):
        raise ValueError("军需存档格式无效")
    receipt = str(UUID(str(data["purchaseId"]))) if "purchaseId" in data else None
    with db:
        db.execute("BEGIN IMMEDIATE")
        if receipt and db.execute("SELECT 1 FROM pending_purchases WHERE id=?", (receipt,)).fetchone():
            return {"saved": True}
        snapshot = gear_snapshot(db)
        if snapshot["revision"] != data["revision"]:
            return {"saved": False}
        db.execute("INSERT OR REPLACE INTO quartermaster VALUES(1,?,?)",
                   (snapshot["revision"] + 1, json.dumps(data["state"], separators=(",", ":"))))
        if receipt:
            db.execute("INSERT INTO pending_purchases VALUES(?)", (receipt,))
    return {"saved": True}


def weapon_loadout(db):
    row = db.execute("SELECT skin FROM weapon_loadout WHERE slot = 1").fetchone()
    skin = row["skin"] if row else None
    won = skin in WEAPON_UNLOCKS and db.execute("SELECT 1 FROM battles WHERE won=1 AND level=?", (WEAPON_UNLOCKS[skin],)).fetchone()
    return {"equippedSkin": skin if won else None}


def save_loadout(db, data):
    if not isinstance(data, dict) or set(data) != {"skin"}:
        raise ValueError("武器外观设置无效")
    skin = data["skin"]
    if skin is not None and (not isinstance(skin, str) or skin not in WEAPON_UNLOCKS):
        raise ValueError("武器外观不存在")
    with db:
        db.execute("BEGIN IMMEDIATE")
        if skin is None:
            db.execute("DELETE FROM weapon_loadout WHERE slot = 1")
        else:
            if not db.execute("SELECT 1 FROM battles WHERE level = ? AND won = 1", (WEAPON_UNLOCKS[skin],)).fetchone():
                raise PermissionError("通关对应关卡后才能佩戴")
            db.execute(
                "INSERT INTO weapon_loadout VALUES (1, ?) ON CONFLICT(slot) DO UPDATE SET skin = excluded.skin",
                (skin,),
            )
    return {"equippedSkin": skin}


def whole_number(value, minimum=0, maximum=2**53 - 1):
    return type(value) is int and minimum <= value <= maximum


def battle_detail(db, battle_id):
    row = db.execute("""SELECT b.id, b.level, b.won, b.kills, b.duration_ms AS durationMs,
                        b.ended_at AS endedAt, r.detail,
                        EXISTS(SELECT 1 FROM battle_replays WHERE battle_id=b.id) AS hasReplay
                        FROM battles b LEFT JOIN battle_reports r ON r.battle_id=b.id WHERE b.id=?""",
                     (battle_id,)).fetchone()
    if row is None:
        return None
    data = dict(row)
    detail = data.pop("detail")
    data["report"] = json.loads(detail) if detail else None
    data["loot"] = [dict(item) for item in db.execute(
        "SELECT name,value FROM battle_loot WHERE battle_id=? ORDER BY name", (battle_id,))]
    return data


def statistic_rows(db):
    fields = ("weapon", "weaponKills", "eliteKills", "hits", "shots", "maxCombo", "grade", "mode", "variation")
    columns = ", ".join(f"json_extract(r.detail, '$.{key}') AS {key}" for key in fields)
    return [dict(row) for row in db.execute(f"""SELECT b.level, b.won, b.kills, b.duration_ms AS durationMs,
            {columns}, json_extract(r.detail, '$.scores') AS scoreJson
            FROM battles b LEFT JOIN battle_reports r ON b.id=r.battle_id""")]


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
        or not isinstance(items, list) or len(items) > 64
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
    remaining = data.get("remaining", {})
    allowed = {"medkit", "grenade", "ammo", "mine"} | {"cache-" + level_id for level_id in LEVEL_IDS}
    if (not isinstance(remaining, dict) or len(remaining) > 2 or any(
            key not in allowed or not whole_number(n, 0, 3) for key, n in remaining.items())):
        raise ValueError("携带数量无效")
    report = data.get("report")
    if report is not None and not isinstance(report, dict):
        raise ValueError("战报格式无效")
    return battle_id, level, won, ended_at, duration_ms, kills, loot, remaining, report


def save_battle(db, battle):
    battle_id, level, won, ended_at, duration_ms, kills, loot, remaining, report = battle
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
            for name in list(loot):
                if name.startswith("秘藏·"):
                    db.execute("INSERT OR IGNORE INTO secret_rooms(level) VALUES (?)", (level,))
                    if not db.execute("UPDATE secret_rooms SET claimed=1 WHERE level=? AND claimed=0", (level,)).rowcount:
                        del loot[name]
            db.executemany(
                "INSERT INTO battle_loot (battle_id, name, value) VALUES (?, ?, ?)",
                ((battle_id, name, value) for name, value in loot.items()),
            )
            if report is not None:
                db.execute("INSERT INTO battle_reports VALUES (?, ?)", (battle_id, json.dumps(report, allow_nan=False)))
            recovered_core = "精英改装材料·穿透弹芯" in loot
            if won and (remaining or recovered_core):
                snapshot = gear_snapshot(db)
                stock = snapshot["state"].setdefault("stock", {})
                if recovered_core:
                    snapshot["state"].setdefault("mods", {})["pierce"] = True
                for key, n in remaining.items():
                    stock[key] = stock.get(key, 0) + n
                db.execute("INSERT OR REPLACE INTO quartermaster VALUES(1,?,?)",
                           (snapshot["revision"] + 1, json.dumps(snapshot["state"])))
    next_level = LEVELS[position + 1] if won and position + 1 < len(LEVELS) else None
    return {"nextLevel": next_level, "campaignCleared": bool(won and next_level is None)}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".js": "text/javascript"}

    def profile_db(self):
        database = self.server.database
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
            slot = cookies.get("super_player_profile")
            selected = self.headers.get("X-Campaign-Profile", slot.value if slot else "")
            profile = str(UUID(selected)) if selected else None
        except (CookieError, ValueError):
            profile = None
        if not profile:
            return connect(database)
        db = connect(database.with_name(database.name + "." + profile))
        db.executescript(SCHEMA)
        return db

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
        if path in {"/api/progress", "/api/battles", "/api/loadout", "/api/gear", "/api/report", "/api/replay", "/api/statistics"}:
            try:
                with closing(self.profile_db()) as db:
                    if path == "/api/progress":
                        result = progress(db)
                    elif path == "/api/gear":
                        result = gear_snapshot(db)
                    elif path == "/api/loadout":
                        result = weapon_loadout(db)
                    elif path == "/api/statistics":
                        result = statistic_rows(db)
                        for row in result:
                            row["scores"] = json.loads(row.pop("scoreJson") or "{}")
                    elif path in {"/api/report", "/api/replay"}:
                        battle_id = str(UUID(parse_qs(parts.query).get("id", [""])[0]))
                        if path == "/api/report":
                            result = battle_detail(db, battle_id)
                        else:
                            row = db.execute("SELECT replay FROM battle_replays WHERE battle_id=?", (battle_id,)).fetchone()
                            result = json.loads(row[0]) if row else None
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
        elif path in {"/practice/", "/practice/index.html", "/campaign/onboarding.mjs"}:
            file = ROOT / ("practice/index.html" if level == "practice" else "campaign/onboarding.mjs")
        elif level in LEVEL_IDS and path in {f"/{level}", f"/{level}/", f"/{level}/index.html"}:
            try:
                with closing(self.profile_db()) as db:
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
        elif path in {"/campaign/profiles.mjs", "/campaign/home.css", "/campaign/home.mjs", "/campaign/save.mjs", "/campaign/weapon-preview.mjs",
                      "/campaign/levels.json", "/campaign/store.mjs", "/campaign/browser-store.mjs", "/campaign/reports.mjs",
                      "/campaign/weapon-build.mjs", "/level-kit/preview.html", "/level-kit/vendor/three-r160.js",
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

    def end_headers(self):
        if urlsplit(self.path).path == "/campaign/levels.json":
            self.send_header("X-Super-Player-Store", "sqlite")
        super().end_headers()

    def translate_path(self, path):
        return str(self.static_file)

    def redirect(self, location):
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.path not in {"/api/battles", "/api/loadout", "/api/gear", "/api/replay", "/api/discovery"}:
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
            limit = {"/api/gear": 262_144, "/api/replay": 524_288, "/api/battles": 32_768}.get(self.path, 16_384)
            if not 0 < size <= limit:
                raise ValueError("请求大小无效")
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            with closing(self.profile_db()) as db:
                if self.path == "/api/gear":
                    result = write_gear(db, data)
                elif self.path == "/api/discovery":
                    level = data.get("level")
                    if level not in LEVEL_IDS or not unlocked_levels(db)[LEVEL_IDS.index(level)]["unlocked"]:
                        raise ValueError("关卡尚未开放")
                    with db:
                        db.execute("INSERT OR IGNORE INTO secret_rooms(level) VALUES (?)", (level,))
                    result = {"claimed": bool(db.execute("SELECT claimed FROM secret_rooms WHERE level=?", (level,)).fetchone()[0])}
                elif self.path == "/api/battles":
                    result = save_battle(db, validate_battle(data))
                elif self.path == "/api/replay":
                    battle_id = str(UUID(data.get("id", "")))
                    replay = data.get("replay")
                    if not isinstance(replay, dict) or not isinstance(replay.get("samples"), list):
                        raise ValueError("回放格式无效")
                    with db:
                        if not db.execute("SELECT id FROM battles WHERE id=?", (battle_id,)).fetchone():
                            raise ValueError("找不到本局记录")
                        db.execute("INSERT OR IGNORE INTO battle_replays VALUES (?,?)",
                                   (battle_id, json.dumps(replay, allow_nan=False)))
                    result = {"saved": True}
                else:
                    result = save_loadout(db, data)
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


class CampaignServer(ThreadingHTTPServer):
    # 首页缩略图与存档 API 可能同时请求，给本机浏览器保留连接队列。
    request_queue_size = 64


def main():
    parser = argparse.ArgumentParser(description="启动超级玩家本机服务")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", type=Path, default=ROOT / ".data" / "super-player.sqlite3")
    options = parser.parse_args()
    if any(not (ROOT / level / "index.html").is_file() for level in LEVEL_IDS):
        parser.exit(1, "请先在项目根目录运行 npm ci 和 npm run build 生成关卡。\n")
    with CampaignServer(("127.0.0.1", options.port), Handler) as server:
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
