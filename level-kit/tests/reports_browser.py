"""战报、回放和全局音效的实际浏览器回归，SQLite 使用临时数据库。"""
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from campaign_browser import ROOT, LEVELS, expose_game, sync_playwright


def run(browser, url, static):
    context = browser.new_context(viewport={"width": 920, "height": 680})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    if static:
        def manifest(route):
            response = route.fetch()
            headers = {k: v for k, v in response.headers.items() if k.lower() != "x-super-player-store"}
            route.fulfill(status=200, headers=headers, body=response.body())
        page.route("**/campaign/levels.json", manifest)
    level = LEVELS[0]["id"]
    page.route(url + "/" + level + "/", expose_game)
    page.goto(url)
    page.get_by_role("button",name="直接开始",exact=True).click()
    page.locator("#continue").wait_for()
    # 兼容旧键位，包括默认新快捷键已经被使用的情况。
    migrated = page.evaluate("""async () => {
      const {preferences,storePreferences}=await import('./level-kit/src/preferences.mjs');
      const prefs=preferences(); delete prefs.keys.KeyM; delete prefs.keys.KeyI;
      prefs.keys.KeyW='KeyM'; storePreferences(prefs);
      const actual=preferences(); localStorage.removeItem('super-player:preferences:v1');
      return [actual.keys.KeyW,actual.keys.KeyM,actual.recordReplay];
    }""")
    assert migrated[0] == "KeyM" and migrated[1] != "KeyM" and migrated[2] is False
    page.click("#mute")
    assert "已静音" in page.locator("#mute").inner_text()
    page.click("#settings-open")
    replay = page.get_by_label("录制战术回放")
    assert not replay.is_checked()
    replay.check()
    page.get_by_label("主音量").fill("47")
    page.get_by_label("切换音效", exact=True).click()
    page.keyboard.press("y")
    page.keyboard.press("Escape")
    page.click("#continue")
    page.wait_for_function("!!window.run")
    assert "已静音" in page.locator("#sound").inner_text()
    peer = page.context.new_page()
    peer.goto(url)
    peer.evaluate("""async () => {
      const {preferences,storePreferences}=await import('/level-kit/src/preferences.mjs');
      storePreferences({...preferences(),difficulty:'hard'});
    }""")
    peer.close()
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    assert page.evaluate("[run.config.player.incoming,run.game.journal.difficulty]") == [1,"standard"]
    page.keyboard.press("y")
    page.wait_for_function("run.game.sound.enabled")
    assert page.evaluate("run.config.audio.volume") == .47
    page.keyboard.press("i")
    assert page.evaluate("run.game.weapon.inspectTime > 0")
    page.mouse.down()
    page.wait_for_function("run.game.weapon.inspectTime === 0")
    page.mouse.up()
    page.evaluate("""() => {
      const g=run.game; g.time=3; g.player.x+=4; g.bossDead=true; g.core=true;
      g.journal.update(g); g.loot.push({name:'演练宝物',value:25}); g.value=25;
      g.kills=3; g.performance.weaponKills=2; g.performance.eliteKills=1; g.performance.shots=4; g.performance.hits=2; g.finish(true);
    }""")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.goto(url + "/#history")
    page.get_by_role("button", name="查看战报").first.click()
    page.get_by_role("button", name="观看回放").click()
    page.locator(".replay-viewer canvas").wait_for()
    assert "演练宝物" in page.locator("#panel-body").inner_text()
    page.get_by_role("button", name="播放", exact=True).click()
    page.get_by_role("button", name="暂停", exact=True).click()
    page.get_by_label("回放进度").fill("2000")
    page.get_by_role("button", name=re.compile("击败首领")).click()
    assert int(page.get_by_label("回放进度").input_value()) >= 3000
    page.keyboard.press("Escape")
    page.click("#settings-open")
    page.get_by_label("录制战术回放").uncheck()
    page.keyboard.press("Escape")
    page.goto(url + "/" + level + "/")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    assert page.evaluate("run.game.weapon.savedKills") == 2
    assert page.evaluate("run.game.journal.samples === null")
    page.evaluate("run.game.finish(false,'主动退出')")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.goto(url + "/#history")
    page.get_by_role("button", name="查看战报").first.click()
    page.get_by_text("主动退出", exact=False).first.wait_for()
    assert page.get_by_role("button", name="观看回放").count() == 0
    page.keyboard.press("Escape")
    page.get_by_role("button", name="查看战报").nth(1).click()
    page.get_by_role("button", name="观看回放").wait_for()
    page.keyboard.press("Escape")
    # 回放写入拒绝后，战报、解锁和常规待存队列仍按正常路径完成。
    page.click("#settings-open")
    page.get_by_label("录制战术回放").check()
    page.keyboard.press("Escape")
    page.goto(url + "/" + level + "/")
    page.click("#start")
    page.wait_for_function("run.game.phase==='play'")
    page.evaluate("""async () => {
      const store=await (await import('../campaign/store.mjs')).campaignStore();
      store.saveReplay=async () => { throw Error('测试配额不足'); };
      run.game.finish(true);
    }""")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.goto(url)
    page.locator("#continue").wait_for()
    detail = page.evaluate("""async () => {
      const store=await (await import('./campaign/store.mjs')).campaignStore();
      const level=store.levels[0].id;
      const legacy={id:crypto.randomUUID(),level,won:true,endedAt:Date.now(),durationMs:500,kills:7,loot:[{name:'旧宝物',value:3}]};
      await Promise.all([store.save(legacy),store.save(legacy)]);
      const state=await store.progress(), old=await store.report(legacy.id);
      const failed=await store.report(state.battles.find(row=>row.id!==legacy.id).id);
      const rows=await store.statistics(); const recorded=(await Promise.all(state.battles.map(b=>store.report(b.id)))).find(r=>r.hasReplay);
      return {count:state.battleCount,old,failed,total:rows.reduce((s,r)=>s+r.kills,0),
              elite:rows.reduce((sum,r)=>sum+(r.eliteKills??0),0),recorded:recorded.id};
    }""")
    assert detail["count"] == 4 and detail["total"] == 10, detail
    assert detail["elite"] == 1, detail
    page.get_by_role("button",name="成就与统计").click()
    assert "精英击杀 1" in page.locator("#panel-body").inner_text()
    page.keyboard.press("Escape")
    if static:
        migrated=page.evaluate("""async () => {
          const path='migration-'+crypto.randomUUID(),id=crypto.randomUUID();
          const req=indexedDB.open('super-player:'+path,2);
          req.onupgradeneeded=()=>{
            const db=req.result,b=db.createObjectStore('battles',{keyPath:'sequence',autoIncrement:true});
            b.createIndex('id','id',{unique:true});b.createIndex('outcome',['level','won']);
            db.createObjectStore('settings');db.createObjectStore('replays');
            const reports=db.createObjectStore('reports');reports.add({eliteKills:3,shots:12},id);
            b.add({id,level:'underground-lab',won:1,kills:5,durationMs:100,endedAt:100,loot:[],stats:{shots:12}});
          };
          await new Promise((resolve,reject)=>{req.onsuccess=resolve;req.onerror=reject;});req.result.close();
          const {openBrowserStore}=await import('./campaign/browser-store.mjs');
          return (await (await openBrowserStore([],path)).statistics())[0];
        }""")
        assert migrated["kills"] == 5 and migrated["shots"] == 12 and migrated["eliteKills"] == 3, migrated
    assert not detail["old"].get("report") and detail["old"]["loot"][0]["name"] == "旧宝物"
    assert detail["failed"]["report"] and not detail["failed"]["hasReplay"]
    page.evaluate("async () => (await import('./campaign/profiles.mjs')).createProfile()")
    page.reload()
    page.locator("#continue").wait_for()
    assert not page.locator("#first-entry").count()
    isolated=page.evaluate("""async id=>{
      const store=await (await import('./campaign/store.mjs')).campaignStore();
      return [await store.report(id),await store.replay(id),(await store.statistics()).length];
    }""",detail["recorded"])
    assert isolated == [None,None,0], isolated
    if not static:
        page.route("**/api/statistics",lambda route:route.fulfill(status=503,body=""))
        page.reload()
        page.locator("#continue").wait_for()
        assert page.locator(".mission-card").count()==len(LEVELS)
        page.get_by_role("button",name="成就与统计").click()
        assert "未能读取战斗统计" in page.locator("#panel-body").inner_text()
    assert not errors, errors
    context.close()


if __name__ == "__main__":
    with TemporaryDirectory() as tmp:
        proc=subprocess.Popen([sys.executable,"-X","utf8","-u","server.py","--port","0","--db",str(Path(tmp)/"test.sqlite")],
                              cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding="utf-8")
        try:
            url=re.search(r"http://127\.0\.0\.1:\d+",proc.stdout.readline()).group()
            with sync_playwright() as pw:
                browser=pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER","chrome"))
                try:
                    for static in (False, True):
                        run(browser,url,static)
                        print("PASS battle report / replay / mute / counter", "IndexedDB" if static else "SQLite", flush=True)
                finally:
                    browser.close()
        finally:
            proc.terminate()
            proc.wait()
