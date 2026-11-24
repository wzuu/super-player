"""从临时 SQLite 战役入口用正式走位、步枪射线和主线补给完成第一关。"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def verify(browser, url):
    page = browser.new_page(viewport={"width": 960, "height": 620})
    page.add_init_script("""let seed=5381; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        window.requestAnimationFrame=()=>1;
        localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true}));
        localStorage.setItem('super-player:variation:1',JSON.stringify({pending:'quiet'}));""")
    def expose(route):
        response = route.fetch()
        html = response.text().replace("    startLevel(definition, campaign, campaignStage);",
                                       "    window.run=startLevel(definition,campaign,campaignStage);")
        html = html.replace("return { game, scene, camera, renderer, config:", "return { game,input,scene,camera,renderer,config:")
        route.fulfill(response=response, body=html)
    page.route(re.compile(r"/underground-lab/(?:index\.html)?(?:\?.*)?$"), expose)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url + "/underground-lab/?campaign")
    page.get_by_text("直接开始", exact=True).click(force=True)
    page.wait_for_function("!!window.run", polling=100)
    page.locator("#start").click(force=True)
    page.wait_for_function("run.game.phase==='play'", polling=100)
    result = page.evaluate((ROOT/"level-kit/tests/lab_live_driver.js").read_text(encoding="utf-8"))
    print(json.dumps(result, ensure_ascii=False), flush=True)
    assert result["phase"] == "win" and not result["optional"] and not result["sideRooms"] and not errors, (result, errors)
    assert result["missed"] and result["gunBreaks"] and result["pulseBreaks"], result
    assert result["spawned"] == [100,100,100] and result["enterAmmo"] and sum(result["afterBoss"])>0, result
    page.wait_for_function("async()=> (await (await fetch('/api/progress')).json()).levels[1].unlocked", polling=100)
    assert page.request.get(url + "/api/progress").json()["battleCount"] == 1
    page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as folder:
        server = subprocess.Popen([sys.executable, "-X", "utf8", "-u", "server.py", "--port", "0",
                                   "--db", str(Path(folder)/"campaign.sqlite")], cwd=ROOT,
                                  stdout=subprocess.PIPE, encoding="utf-8")
        try:
            url = re.search(r"http://127\.0\.0\.1:\d+", server.stdout.readline()).group()
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
                try:
                    verify(browser, url)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
