"""首次选择、逐步教程、无限火力与正式存档隔离。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from campaign_browser import ROOT, expose_game, sync_playwright


def verify_recovery_menu(page):
    # 先走过一段安全地面，再用实体障碍模拟夹住玩家的情形。
    page.keyboard.down("a")
    page.wait_for_timeout(800)
    page.keyboard.up("a")
    page.evaluate("document.exitPointerLock()")
    page.wait_for_function("run.game.phase === 'pause'")
    saved = page.evaluate("""() => {
      const g=run.game, p=g.player;
      window.stuckBox=g.level.box(p.x,p.z,.35,.35,p.y,p.y+1.95);
      if(!g.level.blocked(p.x,p.z,p.y,p.radius,p.height))throw Error('未构造出碰撞');
      window.practiceProgress=()=>[g.training.guide(g).stage,g.time,g.weapon.ammo,g.weapon.reserve,
        g.kit.remaining(),g.kills,g.loot.map(i=>[i.name,i.value]),g.pickups.objects.filter(i=>i.active).length];
      return practiceProgress();
    }""")
    page.get_by_role("button", name="卡住脱离").click()
    assert "已回到安全位置" in page.locator("#menu-status").inner_text()
    assert page.evaluate("practiceProgress()") == saved
    assert page.evaluate("""() => {const g=run.game,p=g.player;
      return g.phase==='pause' && !document.pointerLockElement && !g.level.blocked(p.x,p.z,p.y,p.radius,p.height);
    }""")
    page.evaluate("stuckBox.active=false")
    page.get_by_role("button", name="继续游戏").click()
    page.wait_for_function("run.game.phase==='play'")


def check(browser, url, static=False):
    page=browser.new_page(viewport={"width":960,"height":640})
    errors=[]
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    if static:
        def manifest(route):
            r=route.fetch()
            route.fulfill(status=200,headers={k:v for k,v in r.headers.items() if k.lower()!='x-super-player-store'},body=r.body())
        page.route("**/campaign/levels.json",manifest)
    page.route("**/practice/index.html*",expose_game)
    page.goto(url)
    choice=page.get_by_role("dialog",name="首次进入战役")
    choice.wait_for()
    page.keyboard.press("Escape")
    assert choice.is_visible()
    page.mouse.click(2,2)
    assert choice.is_visible()
    page.get_by_role("button",name="开始新手教程").click()
    page.wait_for_function("!!window.run")
    assert page.evaluate("run.game.training.kind")=="tutorial"
    assert page.locator("#unstuck").is_hidden()
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    platforms=page.evaluate((ROOT/'level-kit/tests/tutorial_platforms.js').read_text(encoding="utf-8")+
                            "\ncheckTutorialPlatforms()")
    print("PASS tutorial platform landings and walk/jump exits",platforms,flush=True)
    def step(name):
        page.wait_for_function("name=>run.game.training.guide(run.game).stage==='tutorial-'+name",arg=name,timeout=6000)
    step("look")
    # 玩家可能在看到道具指引前就已用完练习手雷。
    for _ in range(3): page.keyboard.press("2")
    assert page.evaluate("run.game.kit.remaining().grenade") == 0
    page.mouse.move(520,320)
    page.mouse.move(580,341)
    step("walk")
    def hold(key,ms=200):
        page.keyboard.down(key); page.wait_for_timeout(ms); page.keyboard.up(key)
    for key in ["w","a","s","d"]: hold(key)
    step("sprint")
    page.keyboard.down("Shift"); hold("w"); page.keyboard.up("Shift")
    step("jump"); hold("Space")
    step("crouch"); hold("c")
    step("pause"); page.evaluate("document.exitPointerLock()")
    page.wait_for_function("run.game.phase==='pause'");page.click("#start")
    step("shoot"); verify_recovery_menu(page)
    page.mouse.down();page.wait_for_timeout(200);page.mouse.up()
    step("reload"); hold("r")
    step("empty"); page.mouse.down()
    page.wait_for_function("['tutorial-pickup','tutorial-slot0'].includes(run.game.training.guide(run.game).stage)")
    page.mouse.up()
    # 脱困后的路线可能已经经过弹箱；其余情况移至练习弹药旁，仍由正式拾取逻辑推进。
    page.evaluate("""() => {const g=run.game,task=g.training.guide(g);
      if(task.stage==='tutorial-pickup'){const t=task.target;Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}
    }""")
    for i,key in enumerate(["q","e","1","2"]):
        step("slot"+str(i))
        if i==3:
            assert page.evaluate("run.game.kit.remaining().grenade") == 1
            page.evaluate("""()=>{
              const g=run.game,p=g.player,a=g.level.bossSpawn;
              Object.assign(p,{x:a.x,y:a.y,z:a.z});
              const spawn=g.beasts.spawnGroup.bind(g.beasts);
              window.birthGaps=[];
              g.beasts.spawnGroup=(...args)=>{
                const group=spawn(...args);
                for(const b of group)birthGaps.push([b.type,Math.hypot(b.x-p.x,b.z-p.z)-b.radius-p.radius]);
                return group;
              };
            }""")
        hold(key)
    for name in ["kill","boss"]:
        step(name)
        page.evaluate("""() => { const g=run.game,b=g.training.guide(g).target;
          if(!b || birthGaps.at(-1)?.[0]!==b.type || birthGaps.at(-1)[1]<run.config.beasts.safeSpawnGap)
            throw Error('教程目标紧贴玩家');
          g.beasts.damage(b,10000,g,'weapon'); }""")
    step("core")
    page.evaluate("""() => { const g=run.game,t=g.pickups.keyItem;Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}""")
    hold("f");step("gate")
    page.evaluate("""() => { const g=run.game,t=g.level.gate; Object.assign(g.player,{x:t.x,y:t.y,z:t.z});}""")
    hold("f"); page.wait_for_function("run.game.phase==='win'")
    assert page.locator("#unstuck").is_hidden()
    assert page.get_by_role("link",name="开始战役").is_visible()
    page.click("#campaign-home")
    page.locator("#continue").wait_for()
    assert not choice.count()
    assert page.locator("#progress-count").inner_text().startswith("0 /")
    page.get_by_role("link",name="火力试验场").click()
    page.wait_for_function("!!window.run")
    page.click("#start");page.wait_for_function("run.game.phase==='play'")
    page.mouse.down()
    page.wait_for_function("run.game.performance.shots >= 54",timeout=20000)
    page.mouse.up()
    assert page.evaluate("run.game.weapon.reserve === Infinity")
    waves=page.evaluate("""()=>{
      const {game:g,config}=run, m=g.beasts,t=g.training,result=[];
      g.reset();g.phase='play';
      for(let wave=1;wave<=5;wave++){
        const group=m.pool.filter(b=>b.active);
        if(!t.guide(g).title.startsWith('第 '+wave+' 波') ||
          group.some(b=>Math.hypot(b.x-g.player.x,b.z-g.player.z)-b.radius-g.player.radius<config.beasts.safeSpawnGap))
          throw Error('试验场波次或安全距异常');
        result.push(group.length);
        g.time+=19;
        m.damage(group[0],1e7,g,'weapon');t.step(g);
        if(m.live!==group.length-1 || !t.guide(g).title.startsWith('第 '+wave+' 波'))throw Error('中途补怪');
        for(const b of group.slice(1))m.damage(b,1e7,g,'weapon');
        t.step(g);
      }
      return result;
    }""")
    assert waves==[10,12,14,16,18],waves
    page.evaluate("document.exitPointerLock()"); page.click("#practice-restart")
    page.wait_for_function("run.game.phase==='play' && run.game.time<5")
    page.evaluate("document.exitPointerLock()"); page.click("#campaign-home")
    page.locator("#continue").wait_for()
    assert "0 局" in page.locator("#battle-count").text_content()
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        proc=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                              cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding="utf-8")
        try:
            url=re.search(r"http://127\.0\.0\.1:\d+",proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                try:
                    for static in (False,True):
                        check(browser,url,static)
                        print("PASS first choice, tutorial, range, isolated progress","IndexedDB" if static else "SQLite",flush=True)
                finally:
                    browser.close()
        finally:
            proc.terminate(); proc.wait()
