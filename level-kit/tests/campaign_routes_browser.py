"""逐关验证非实验室地图的首帧驻敌、各房收益、实际步行和默认行动结算。

模拟步使用正式碰撞和任务逻辑，按房间加速击倒。GPU 基准复用这里的
隔离游戏页面，以固定现场测量首次接敌和持续帧时间。
"""
import argparse
import json
import os
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT

TESTS = Path(__file__).parent
ENTRY = "    startLevel(definition, campaign, campaignStage);"
INIT = """
  let seed = SEED;
  Math.random = () => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296;
  localStorage.setItem('super-player:preferences:v1', JSON.stringify({quality:'medium',steady:true,muted:true}));
  Element.prototype.requestPointerLock = () => { throw Error('测试禁止系统锁鼠'); };
"""


@contextmanager
def scenario_page(browser, root, stage, seed):
    file = (root / stage / "index.html").resolve()
    html = file.read_text(encoding="utf-8")
    assert html.count(ENTRY) == 1 and html.count("function animate(now) {") == 1
    html = html.replace(ENTRY, "    window.run={...startLevel(definition,campaign,campaignStage),definition};")
    html = html.replace("function animate(now) {", "window.renderScenarioFrame=animate;function animate(now) {")
    html = html.replace("requested = requestAnimationFrame(animate);", "requested = 0;")
    page = browser.new_page(viewport={"width": 960, "height": 540}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.add_init_script(INIT.replace("SEED", str(seed)))
        page.route(file.as_uri(), lambda route: route.fulfill(body=html, content_type="text/html"))
        page.goto(file.as_uri())
        page.wait_for_function("!!window.run")
        yield page
        assert not errors, errors
    finally:
        page.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stages", nargs="*")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--seed", type=int, default=8787)
    parser.add_argument("--leave-rewards", action="store_true", help="站在生成点清敌，放弃清房收益后继续至结算")
    args = parser.parse_args()
    stages = args.stages or [
        item["id"] for item in json.loads((args.root / "campaign/levels.json").read_text(encoding="utf-8"))
        # 开门部署的三关由 lab_live_browser 和 annihilation_browser 从首页走完整局。
        if item["id"] not in ("underground-lab","moonlit-stained-glass-keep","orbital-brood-ring")
    ]
    with sync_playwright() as pw, pw.chromium.launch(channel=os.getenv("GAME_TEST_BROWSER", "chrome")) as browser:
        for stage in stages:
            with scenario_page(browser, args.root, stage, args.seed) as page:
                page.add_script_tag(path=TESTS / "campaign_walk.js")
                result = page.evaluate("walkCampaignRoute", not args.leave_rewards)
                assert result["phase"] == "win", (stage, result)
                print(stage, json.dumps(result, ensure_ascii=False), flush=True)
