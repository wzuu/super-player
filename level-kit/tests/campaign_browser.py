"""用本机 Chrome 验证打包入口、空仓换弹、解锁与跨关佩戴。

需要开发机安装 Python Playwright；运行游戏本身只需要标准库。
"""

import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from uuid import uuid4

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
LEVELS = json.loads((ROOT / "campaign/levels.json").read_text(encoding="utf-8"))
NEW_STAGES = ["sakura-night-town", "brass-factory", "haunted-midway"]


def expose_game(route):
    # startLevel 已返回运行状态，只在测试浏览器中保留引用以布置边界局面。
    response = route.fetch()
    entry = "    startLevel(definition, campaign, campaignStage);"
    html = response.text()
    assert html.count(entry) == 1, "关卡入口已变更"
    route.fulfill(response=response, body=html.replace(entry, entry.replace("startLevel(", "window.run = startLevel(")))


def check_reload(page):
    page.evaluate("""() => {
        const g = run.game, w = g.weapon;
        w.ammo = 1; w.reserve = 4; w.cooldown = 0;
    }""")
    page.mouse.down()
    try:
        page.wait_for_function("run.game.weapon.reloadLeft > 0 && run.game.weapon.ammo === 0")
        page.wait_for_function("document.querySelector('#weapon-state').textContent.includes('换弹中')")
        page.wait_for_function("run.game.weapon.reserve === 0 && run.game.weapon.ammo === 0")
        page.wait_for_function("document.querySelector('#weapon-state').textContent === '弹药耗尽'")
        assert page.evaluate("run.game.weapon.reloadLeft") == 0
    finally:
        page.mouse.up()
    page.evaluate("Object.assign(run.game.weapon, {ammo: 3, reserve: 2})")
    page.keyboard.press("r")
    page.wait_for_function("run.game.weapon.reloadLeft > 0")
    page.keyboard.press("Escape")
    page.wait_for_function("run.game.phase === 'pause'")
    remaining = page.evaluate("run.game.weapon.reloadLeft")
    page.wait_for_timeout(120)
    assert page.evaluate("run.game.weapon.reloadLeft") == remaining
    page.locator("#start").click()
    page.wait_for_function("run.game.weapon.ammo === 5 && run.game.weapon.reserve === 0")


def check_exit(page, url, level_id):
    name = page.evaluate("""() => {
        const g = run.game, boss = g.beasts.boss;
        g.beasts.damage(boss, boss.hp + 1, g, 'weapon');
        const items = g.pickups.objects;
        const treasure = items.find(i => i.active && i.kind === 'rare');
        const core = items.find(i => i.active && i.kind === 'core');
        for (const item of [treasure, core]) {
            Object.assign(g.player, {x:item.x, y:item.y, z:item.z});
            g.pickups.update(.05, g.player, g);
        }
        g.kills = run.config.beasts.killsToWin;
        const gate = g.level.gate;
        Object.assign(g.player, {x:gate.x, y:gate.y, z:gate.z});
        return treasure.name;
    }""")
    page.keyboard.press("e")
    page.wait_for_function("run.game.phase === 'win'")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    progress = page.request.get(url + "/api/progress").json()
    assert any(row["level"] == level_id and row["name"] == name for row in progress["loot"])
    assert next(level for level in progress["levels"] if level["id"] == level_id)["cleared"]


def verify(browser, url):
    page = browser.new_page(viewport={"width": 960, "height": 600})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    for level in LEVELS:
        page.route(url + "/" + level["id"] + "/", expose_game)
    # 建立一个已完成旧关的临时存档，三个新关均经过真实页面结算。
    first_new = next(i for i, row in enumerate(LEVELS) if row["id"] == NEW_STAGES[0])
    for level in LEVELS[:first_new]:
        response = page.request.post(url + "/api/battles", headers={"Origin": url}, data={
            "id": str(uuid4()), "level": level["id"], "won": True, "kills": 150,
            "endedAt": int(time.time() * 1000), "durationMs": 90000, "loot": [],
        })
        assert response.ok, response.text()

    equipped = None
    for stage in NEW_STAGES:
        page.goto(f"{url}/{stage}/")
        page.wait_for_function("!!window.run")
        assert page.evaluate("run.game.weapon.combat.stage") == stage
        assert page.evaluate("run.game.weapon.combat.skin") == (equipped or stage)
        page.locator("#start").click()
        page.wait_for_function("run.game.phase === 'play' && !!document.pointerLockElement")
        if equipped is None:
            check_reload(page)
        check_exit(page, url, stage)
        page.goto(url + "/#collection")
        title = next(level["title"] for level in LEVELS if level["id"] == stage)
        page.locator(".rifle-option").filter(has_text=title).click()
        page.locator("#rifle-equip").click()
        page.wait_for_function("document.querySelector('#rifle-equip').textContent === '已佩戴'")
        assert page.request.get(url + "/api/loadout").json()["equippedSkin"] == stage
        equipped = stage
    page.goto(f"{url}/{LEVELS[0]['id']}/")
    page.wait_for_function("!!window.run")
    assert page.evaluate("run.game.weapon.combat.skin") == NEW_STAGES[-1]
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as storage:
        server = subprocess.Popen(
            [sys.executable, "-X", "utf8", "-u", "server.py", "--port", "0",
             "--db", str(Path(storage) / "campaign.sqlite")],
            cwd=ROOT, stdout=subprocess.PIPE, encoding="utf-8",
        )
        try:
            url = re.search(r"http://127\.0\.0\.1:\d+", server.stdout.readline()).group()
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="chrome")
                try:
                    verify(browser, url)
                finally:
                    browser.close()
            print("PASS campaign_browser")
        finally:
            server.terminate()
            server.wait(timeout=10)
