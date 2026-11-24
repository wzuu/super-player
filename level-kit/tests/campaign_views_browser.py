"""在真实的 100/200 敌群前采样浏览器 RAF、首次接敌和视野，同时保存正常玩家视角。"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from campaign_routes_browser import ROOT, TESTS, scenario_page

VIEWS = {
    "bridge": ("shanhai-secret-realm", "open"),
    "bridge-room": ("shanhai-secret-realm", "cover"),
    "street": ("rain-city", "open"),
    "street-room": ("rain-city", "cover"),
    "lab-hall": ("underground-lab", "open"),
    "lab-room": ("underground-lab", "cover"),
    "lab-archive": ("underground-lab", "archive"),
    "lab-reactor": ("underground-lab", "reactor"),
}
GPU_FLAGS = {"default": [], "integrated": ["--force_low_power_gpu"], "discrete": ["--force_high_performance_gpu"]}


def measure(browser, root, name, seed, frames, screenshots):
    stage, view = VIEWS[name]
    with scenario_page(browser, root, stage, seed) as page:
        page.add_script_tag(path=TESTS / "campaign_views.js")
        info = page.evaluate("prepareCampaignView", [stage, view])
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshots / f"{name}.png")
        samples = page.evaluate("sampleCampaignView", frames)
        expected = 1 if view == "reactor" else (100 if stage == "underground-lab" and view != "archive" else 200)
        assert info["missionCount"] == expected, (name, info)
        assert samples["liveMin"] >= expected, (name, samples)
        return {"scene": name, "browser": browser.version, **info, **samples}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--lab-root", type=Path, help="可选的实验室打包目录")
    parser.add_argument("--gpu", choices=GPU_FLAGS, default="default")
    parser.add_argument("--views", nargs="+", choices=VIEWS, default=list(VIEWS))
    parser.add_argument("--frames", type=int, default=150)
    parser.add_argument("--rounds", type=int, default=1)
    parser.add_argument("--seed", type=int, default=8787)
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.frames < 1 or args.rounds < 1:
        parser.error("帧数和轮数必须为正数")
    with sync_playwright() as pw, pw.chromium.launch(
        channel=os.getenv("GAME_TEST_BROWSER", "chrome"), args=GPU_FLAGS[args.gpu]
    ) as browser:
        for repeat in range(1, args.rounds + 1):
            for name in args.views:
                root = args.lab_root if args.lab_root and name.startswith("lab-") else args.root
                result = measure(browser, root, name, args.seed, args.frames, args.screenshots if repeat == 1 else None)
                print(json.dumps({"round": repeat, **result}, ensure_ascii=False), flush=True)
