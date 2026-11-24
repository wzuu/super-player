"""固定种子比较凶兽剔除、模型分级和远距模拟。浏览器全程无头，无需鼠标或锁鼠。"""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from campaign_browser import ROOT
from encounter_performance import PREPARE, EXERCISE, ROOMS

FIXTURE = Path(__file__).with_name("herd_sample.js").read_text(encoding="utf-8")
STAGES = {"open": "rain-city", "dense": "rain-city", "legacy96": "rain-city", "indoor": "underground-lab", "wall": "underground-lab", "mirror": "haunted-midway",
          "tower": "paris-tower", "machine-room": "underground-lab", "street": "rain-city"}
SEED = """
let seed=750077;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
localStorage.setItem('super-player:preferences:v1',JSON.stringify({quality:'medium',steady:true,muted:true}));
Element.prototype.requestPointerLock=()=>{throw Error('性能测试不使用系统鼠标')};
"""


def measure(browser, root, mode, sample, size, frames):
    file = root / STAGES[sample] / "index.html"
    html = file.read_text(encoding="utf-8")
    entry = "    startLevel(definition, campaign, campaignStage);"
    expose = "return { game, scene, camera, renderer, config: CONFIG, grid: GRID, nav };"
    assert html.count(entry) == html.count(expose) == 1
    html = html.replace(entry, """    window.run=startLevel({...definition,
      config:{...definition.config,beasts:{...definition.config?.beasts,capacity:192}}},
      campaign,campaignStage);""").replace(expose,
        "return {game,scene,camera,renderer,config:CONFIG,grid:GRID,nav,frame:animate,input};")
    # 用指定模拟时间驱动原绘制循环，帧耗时取自浏览器真实 RAF。
    html = html.replace("requested = requestAnimationFrame(animate);", "requested = 0;")
    if sample == "legacy96":
        original = "resolveRifleSkin(practiceWeapon || campaign?.equippedSkin,"
        assert html.count(original) == 1
        html = html.replace(original,"resolveRifleSkin('shotgun-pump',")
    page = browser.new_page(viewport={"width":960,"height":540}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    try:
        page.add_init_script(SEED)
        page.route(file.as_uri(), lambda route: route.fulfill(body=html, content_type="text/html"))
        page.goto(file.as_uri())
        page.wait_for_function("!!window.run", polling=50)
        page.add_script_tag(content=FIXTURE)
        story = sample in ("machine-room", "street")
        page.evaluate("herdSetup", [mode,sample,size])
        if sample == "legacy96":
            page.add_script_tag(content=Path(__file__).with_name("shotgun_stress.js").read_text(encoding="utf-8"))
            stress=page.evaluate("shotgunStress")
            assert stress["actors"] == 96 and "conduct" in stress["firstDiscovery"] and not errors
            return dict(browser=browser.version,gpu=page.evaluate("herdGPU"),mode=mode,sample=sample,
                        actors=96,shotgun=stress["baseline"],conduct=stress["reactions"])
        if story:
            page.evaluate(PREPARE, ROOMS[STAGES[sample]])
            peak = 14 if sample == "machine-room" else 16
            page.evaluate(EXERCISE, [peak, True])
        result = page.evaluate("herdMeasure", frames)
        assert result["shots"] > 0 and not errors, (result,errors)
        if not story:
            assert result["simulated"] == size, result
            if sample in ("open","dense"):
                assert result["submittedMin"] == result["centreInViewMin"] == size, result
            if mode in ("lod","final") and sample == "dense":
                assert result["peakDraws"] <= 40 and result["peakTriangles"] <= 150000, result
                counts=result["lod"]
                assert counts["near"]-counts["bossNear"] <= counts["nearBudget"] and counts["bossNear"]==1, counts
        return dict(browser=browser.version,mode=mode,sample=sample,target=None if story else size,**result)
    finally:
        page.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline",type=Path,help="同版改动前的打包根目录")
    parser.add_argument("--modes",nargs="+",choices=["baseline","off","frustum","cull","diffuse","lod","full-upload","final"],default=["final"])
    parser.add_argument("--samples",nargs="+",choices=list(STAGES),default=list(STAGES))
    parser.add_argument("--sizes",nargs="+",type=int,default=[96,120,160])
    parser.add_argument("--frames",type=int,default=90)
    parser.add_argument("--gpu",choices=["default","integrated","discrete"],default="default")
    args=parser.parse_args()
    flags={"default":[], "integrated":["--force_low_power_gpu"],"discrete":["--force_high_performance_gpu"]}
    if "baseline" in args.modes and not args.baseline: parser.error("baseline 需要打包根目录")
    with sync_playwright() as pw:
        with pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"),headless=True,args=flags[args.gpu]) as browser:
            for mode in args.modes:
                for sample in args.samples:
                    sizes=args.sizes if sample in ("open","indoor") else [160]
                    for size in sizes:
                        row=measure(browser,args.baseline if mode=="baseline" else ROOT,mode,sample,size,args.frames)
                        print(json.dumps(row,ensure_ascii=False),flush=True)
