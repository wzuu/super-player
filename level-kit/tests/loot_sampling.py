"""固定种子统计不同击杀条件下实际创建的物件，供固化掉率前后的同口径复测。"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DRIVER = Path(__file__).with_name("loot_sample.js")
CASES = {
    "underground-lab": [
        ("ordinary", {}), ("low-reserve", {"low": True}), ("elite", {"elite": True}),
        ("boss", {"boss": True}), ("summoned", {"child": True}), ("gun-sample", {"perk": True}),
        *((f"damage-{source}", {"source": source}) for source in ("electric", "equipment", "environment", "detonation")),
        ("damage-dot", {"weapon": "ember-fortress", "dot": True}), ("plenty", {"plenty": True}),
        ("alarm", {"alarm": True}), ("deep-filter", {"deep": True}),
    ],
    "shanhai-secret-realm": [("blood-moon", {"moon": True})],
    "bloodmoon-castle": [
        ("blood-moon", {"moon": True}), ("gun", {"perk": True}), ("blood-moon-gun", {"moon": True, "perk": True}),
    ],
    "rain-city": [("gun", {"perk": True})],
    "haunted-midway": [("gun", {"perk": True}), ("ride-damage", {"source": "environment"})],
    "sakura-night-town": [("lantern", {"lantern": True}), ("lantern-gun", {"lantern": True, "perk": True})],
    "derelict-station": [("vacuum-ejected", {"eject": True}), ("egg-hatch", {"egg": True})],
    "neon-undercity": [("drone", {"type": 2}), ("drone-blast", {"source": "environment"})],
}
EVENTS = {
    "buried-tomb": "sandstorm", "polar-station": "cold", "drowned-city": "flood",
    "ember-fortress": "lava", "derelict-station": "depressurization", "neon-undercity": "emp",
    "jungle-temple": "rising-water", "brass-factory": "steam", "haunted-midway": "ride",
}
ENTRY = "    startLevel(definition, campaign, campaignStage);"


def measure(browser, root, count, seed):
    levels = json.loads((root / "campaign/levels.json").read_text(encoding="utf-8"))
    results = {}
    for row in levels:
        stage = row["id"]
        entry = root / stage / "index.html"
        html = entry.read_text(encoding="utf-8")
        assert html.count(ENTRY) == 1
        html = html.replace(ENTRY, "    window.run=startLevel(definition, campaign, campaignStage);")
        page = browser.new_page()
        try:
            page.add_init_script("""requestAnimationFrame=()=>0;
                Element.prototype.requestPointerLock=()=>{throw Error('本采样不使用系统输入');};""")
            page.route(entry.as_uri(), lambda route: route.fulfill(body=html, content_type="text/html"))
            page.goto(entry.as_uri())
            page.wait_for_function("!!window.run", polling=50)
            page.add_script_tag(content=DRIVER.read_text(encoding="utf-8"))
            page.evaluate("""()=>{const g=run.game;g.effects.spray=()=>{};g.sound.tone=()=>{};
                g.sound.stageEvent=()=>{};g.ui.notify=()=>{};}""")
            cases = [("event-control", {}), ("default-weapon", {"perk": True}), *CASES.get(stage, [])]
            if stage in EVENTS:
                cases.append((EVENTS[stage], {"event": EVENTS[stage]}))
            for label, options in cases:
                key = f"{stage}/{label}"
                results[key] = page.evaluate("sampleEncounterDrops", {
                    "name": stage, "opts": options, "n": count, "seed": seed,
                })
                print(key, results[key]["kinds"], flush=True)
        finally:
            page.close()
    return {"seed": seed, "samplesPerCase": count, "browser": browser.version, "cases": results}


def compare_drops(before, after):
    if before["seed"] != after["seed"] or before["samplesPerCase"] != after["samplesPerCase"]:
        raise ValueError("对照的种子和每种条件采样数须一致")
    if before["cases"].keys() != after["cases"].keys():
        raise ValueError("对照的场景或条件不同")
    for name, case in after["cases"].items():
        kinds = case["kinds"]
        allowed = {"health", "rare"}
        if name == "underground-lab/boss":
            allowed.add("core")
            assert kinds.get("core") == case["n"], case
        unexpected = set(kinds) - allowed
        assert not unexpected, (name, unexpected)
        assert kinds.get("health", 0) + kinds.get("rare", 0) <= case["n"], name
    for kind in ("health", "rare"):
        totals = [sum(case["kinds"].get(kind, 0) for case in record["cases"].values())
                  for record in (before, after)]
        assert totals[1] < totals[0], (kind, totals)
        print(f"{kind}: {totals[0]} -> {totals[1]}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="已生成静态入口的项目根目录")
    parser.add_argument("--samples", type=int, default=4096)
    parser.add_argument("--seed", type=int, default=830117)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--compare", type=Path, help="对照 JSON，验证两类掉率降幅、核心保有率与掉落白名单")
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples 必须是正数")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"), headless=True)
        try:
            result = measure(browser, args.root.resolve(), args.samples, args.seed)
        finally:
            browser.close()
    if args.compare:
        compare_drops(json.loads(args.compare.read_text(encoding="utf-8")), result)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
