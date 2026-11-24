"""用打包后的练习入口验证实际投掷键、投掷物、碰撞、伤害和生命周期。"""
import os
import re

from playwright.sync_api import sync_playwright
from campaign_browser import ROOT


def verify(browser):
    page = browser.new_page(viewport={"width": 960, "height": 640})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    entry = ROOT / "practice/index.html"

    def deterministic_entry(route):
        html = entry.read_text(encoding="utf-8")
        start = "    startLevel(definition, campaign, campaignStage);"
        clock = "requested = requestAnimationFrame(animate);"
        assert html.count(start) == 1 and clock in html
        # 采样同一批对局帧，同时保留浏览器自己的点击、焦点、Pointer Lock 和 Web Audio。
        html = html.replace(start, start.replace("startLevel(", "window.run = startLevel("))
        route.fulfill(body=html.replace(clock, "requested = 1;window.frame = animate;"), content_type="text/html")

    page.route(re.compile(r"/practice/index\.html"), deterministic_entry)
    page.add_init_script("""localStorage.setItem('super-player:preferences:v1',
        JSON.stringify({keys:{Digit2:'KeyP'}}));""")
    page.goto(entry.as_uri() + "?mode=tutorial")
    page.wait_for_function("!!window.run")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase==='play' && Boolean(document.pointerLockElement)")
    page.evaluate("""() => {
      const g=run.game;
      window.probe={bursts:[], sounds:[], launches:0, impacts:[], effects:[]};
      const spray=g.effects.spray.bind(g.effects), cue=g.sound.spatialCue.bind(g.sound);
      const hiss=g.sound.hiss.bind(g.sound), damage=g.beasts.damage.bind(g.beasts);
      g.effects.spray=(pos,color,count,...rest)=>{
        probe.effects.push(count);
        if(count===38)probe.bursts.push(pos.toArray());
        return spray(pos,color,count,...rest);
      };
      g.sound.spatialCue=(pos,player,id)=>{
        if(id==='grenade')probe.sounds.push(pos.toArray());
        return cue(pos,player,id);
      };
      g.sound.hiss=(time,high,...rest)=>{
        if(time===.1 && high===1450)probe.launches++;
        return hiss(time,high,...rest);
      };
      g.beasts.damage=(beast,amount,game,source,hit)=>{
        if(hit?.blastOrigin)probe.impacts.push({beast:beast.x, origin:hit.blastOrigin.toArray(),source});
        return damage(beast,amount,game,source,hit);
      };
      window.mesh=()=>run.scene.getObjectByName('field-grenade');
      window.advance=seconds=>{
        for(let i=0;i<Math.round(seconds*100);i++){g.time+=.01;g.kit.step(.01,g);}
      };
      g.level.box(0,0,40,40,18,20,true);
      Object.assign(g.player,{x:0,y:20,z:0});
      g.player.look.rotation.set(0,0,0);
    }""")
    count = page.evaluate("run.game.kit.remaining().grenade")
    page.keyboard.press("2")
    assert page.evaluate("run.game.kit.remaining().grenade") == count
    results = []
    for pitch in (0, 0.68, -1.35):
        page.evaluate("pitch=>{run.game.kit.supply('grenade');run.game.player.look.rotation.x=pitch;}", pitch)
        before = page.evaluate("[run.game.kit.remaining().grenade,probe.effects.length,probe.launches]")
        page.keyboard.press("p")
        assert page.evaluate("[run.game.kit.remaining().grenade,probe.effects.length,probe.launches]") == [
            before[0] - 1, before[1], before[2] + 1]
        sample = page.evaluate("""() => {
          const start=mesh().position.toArray(), visible=mesh().visible;
          advance(.1);
          const early=mesh().position.toArray();
          advance(1.39);
          const armed=mesh().visible, before=probe.bursts.length;
          advance(.1);advance(.8);
          return {start,early,visible,armed,done:!mesh().visible,
            count:probe.bursts.length-before, end:mesh().position.toArray(),
            flash:probe.bursts.at(-1), sound:probe.sounds.at(-1)};
        }""")
        assert sample["visible"] and sample["armed"] and sample["done"] and sample["count"] == 1, sample
        assert sample["flash"] == sample["sound"] == sample["end"], sample
        assert 20.10 < sample["end"][1] < 20.17 and abs(sample["start"][2]) < .5, sample
        results.append(sample)
    flat, up, down = results
    assert up["early"][1] > up["start"][1] and down["early"][1] < down["start"][1], results
    assert up["end"][2] < flat["end"][2] - 1 and flat["end"][2] < down["end"][2] - 1, results

    page.evaluate("""() => {
      const g=run.game;
      g.level.box(0,-.36,16,.08,20,24);
      window.openBeast=g.beasts.spawn(0,1.2,.9,20);
      window.coveredBeast=g.beasts.spawn(0,1.2,-1.4,20);
      window.poisoned=g.beasts.spawn(0,-1.2,.9,20);
      openBeast.hp=1; coveredBeast.hp=poisoned.hp=10000;
      poisoned.statusEffects.set('poison',{type:'poison',stacks:2,until:g.time+8,tickAt:g.time+7});
      g.beasts.refreshHash();
      g.player.look.rotation.x=0;
      g.kit.supply('grenade');
    }""")
    page.keyboard.press("p")
    start = page.evaluate("mesh().position.toArray()")
    assert start[2] > -.2
    page.evaluate("document.exitPointerLock()")
    page.wait_for_function("run.game.phase==='pause'")
    frozen = page.evaluate("""() => {const t=run.game.time, p=mesh().position.toArray();
        frame(performance.now()+4000);return [run.game.time===t,p,mesh().position.toArray(),mesh().visible];}""")
    assert frozen == [True, start, start, True], frozen
    page.locator("#start").click()
    page.wait_for_function("run.game.phase==='play'")
    page.evaluate("advance(1.8)")
    covered = page.evaluate("""() => {
      const g=run.game, corpse=g.beasts.corpses.find(c=>c.x===openBeast.x && c.z===openBeast.z);
      return {pos:mesh().position.toArray(), hp:coveredBeast.hp, openKilled:!openBeast.active,
        poisonedHp:poisoned.hp, reaction:!poisoned.statusEffects.has('poison'),
        equipment:g.performance.equipmentKills, pushes:corpse && [corpse.slideX,corpse.slideZ,corpse.lift],
        hits:probe.impacts, sound:probe.sounds.at(-1), flash:probe.bursts.at(-1)};
    }""")
    assert covered["pos"][2] > -.2 and covered["hp"] == 10000, covered
    assert covered["openKilled"] and covered["equipment"] == 1 and min(covered["pushes"]) > 0, covered
    assert covered["reaction"] and covered["poisonedHp"] < 10000, covered
    assert sum(h["beast"] == 1.2 for h in covered["hits"]) == 1 and all(
        h["origin"] == covered["flash"] == covered["sound"] and h["source"] == "equipment"
        for h in covered["hits"]), covered

    # 两枚同时在场，后台和浏览器缓存冻结；恢复后分别爆炸一次。
    before = page.evaluate("probe.bursts.length")
    for _ in range(2):
        page.evaluate("run.game.kit.supply('grenade')")
        page.keyboard.press("p")
    assert page.evaluate("run.scene.children.filter(o=>o.name==='field-grenade' && o.visible).length") == 2
    page.evaluate("""() => {
      Object.defineProperty(document,'hidden',{value:true,configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    page.wait_for_function("run.game.phase==='pause' && !document.pointerLockElement")
    assert page.evaluate("probe.bursts.length") == before
    page.locator("#start").click()
    page.wait_for_function("run.game.phase==='play'")
    page.evaluate("advance(2)")
    assert page.evaluate("probe.bursts.length") == before + 2

    for end in ("run.game.finish(false)", "window.dispatchEvent(new PageTransitionEvent('pagehide'))"):
        page.evaluate("run.game.kit.supply('grenade')")
        page.keyboard.press("p")
        assert page.evaluate("mesh().visible")
        before = page.evaluate("probe.bursts.length")
        page.evaluate(end)
        assert not page.evaluate("mesh().visible")
        if "finish" in end:
            page.wait_for_function("!document.pointerLockElement")
            page.locator("#start").click()
            page.wait_for_function("run.game.phase==='play'")
            page.evaluate("advance(2)")
            assert page.evaluate("probe.bursts.length") == before
    assert not errors, errors
    print("三个俯仰落点（米）", [round(-r["end"][2], 2) for r in results],
          "贴墙未穿透、隔墙零伤害、装备击杀", covered["equipment"], "元素、暂停、重开、离开通过")
    page.close()


if __name__ == "__main__":
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"))
        verify(browser)
        browser.close()
