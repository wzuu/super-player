"""战报、回放和全局音效的实际浏览器回归，SQLite 使用临时数据库。"""
import os
import re
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from campaign_browser import ROOT, LEVELS, expose_game, sync_playwright


def legacy_sqlite(browser, url, database):
    # 升级前已存在的磁盘存档，尚无战报、回放和秘室表。
    slot, battle = str(uuid4()), str(uuid4())
    with closing(sqlite3.connect(database.with_name(database.name + "." + slot))) as db, db:
        db.executescript("""
          CREATE TABLE battles(sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, level TEXT NOT NULL,
            won INTEGER NOT NULL, ended_at INTEGER NOT NULL, duration_ms INTEGER NOT NULL, kills INTEGER NOT NULL);
          CREATE TABLE battle_loot(battle_id TEXT NOT NULL REFERENCES battles(id), name TEXT NOT NULL,
            value INTEGER NOT NULL, PRIMARY KEY(battle_id,name));
          CREATE TABLE quartermaster(slot INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL);
          CREATE TABLE weapon_loadout(slot INTEGER PRIMARY KEY, skin TEXT NOT NULL);
          INSERT INTO quartermaster VALUES(1,4,'{"stock":{"grenade":2},"mods":{"reload":true}}');
          INSERT INTO weapon_loadout VALUES(1,'underground-lab');
        """)
        db.execute("INSERT INTO battles VALUES(1,?,'underground-lab',1,1500,1000,5)", (battle,))
        db.execute("INSERT INTO battle_loot VALUES(?,'旧档宝物',35)", (battle,))
    context = browser.new_context()
    context.add_cookies([{"name":"super_player_profile","value":slot,"url":url}])
    page = context.new_page()
    page.goto(url + "/#history")
    page.get_by_role("button", name="查看战报").first.click()
    page.get_by_text("旧档宝物（35）",exact=False).wait_for()
    assert not page.get_by_role("button", name="观看回放").count()
    state = page.evaluate("""async () => {
      const store=await (await import('./campaign/store.mjs')).campaignStore();
      const {defaultGear,selectedBranches}=await import('./level-kit/src/gear.mjs');
      const p=await store.progress(),g=await store.gear();
      return [p.battleCount,p.levels[1].unlocked,p.equippedSkin,g.earned,g.state.stock.grenade,
        Object.values(selectedBranches(defaultGear(g.state),p.equippedSkin)).includes('reload')];
    }""")
    assert state == [1, True, "underground-lab", 35, 2, True], state
    context.close()


def blocked_legacy_upgrade(browser, url):
    context = browser.new_context()
    legacy = context.new_page()
    legacy.goto(url + "/campaign/home.css")
    legacy.evaluate("""() => new Promise((resolve,reject) => {
      const req=indexedDB.open('super-player:/',1);
      req.onupgradeneeded=()=>{
        const db=req.result,b=db.createObjectStore('battles',{keyPath:'sequence',autoIncrement:true});
        b.createIndex('id','id',{unique:true});b.createIndex('outcome',['level','won']);
        db.createObjectStore('settings');
        b.add({id:crypto.randomUUID(),level:'underground-lab',won:1,kills:4,durationMs:500,
               endedAt:1000,loot:[{name:'旧档宝物',value:6}]});
      };
      req.onerror=reject;
      req.onsuccess=()=>{window.oldDatabase=req.result;resolve();};
    })""")
    page = context.new_page()
    page.route("**/campaign/levels.json",lambda route:route.fulfill(json=LEVELS))
    page.goto(url + "/#history",wait_until="domcontentloaded")
    page.get_by_text("请关闭其他打开旧版游戏的标签页",exact=False).wait_for(timeout=3500)
    legacy.close()
    page.get_by_role("button",name="查看战报").click()
    page.get_by_text("旧档宝物（6）",exact=False).wait_for()
    assert not page.get_by_role("button",name="观看回放").count()
    context.close()


def storage_menu(route):
    # connectCampaign 已经创建真实军需菜单、点击处理器及存储连接。压力标签页只打开它。
    response=route.fetch()
    entry="    startLevel(definition, campaign, campaignStage);"
    html=response.text()
    assert html.count(entry)==1
    route.fulfill(response=response,body=html.replace(entry,"""
        window.departure=campaign;
        document.getElementById('start').disabled=false;
        document.getElementById('menu').showModal();
    """))


def departure_retry(context, url, static):
    stage = url + '/underground-lab/'
    backend = "IndexedDB" if static else "SQLite"
    pages=[]
    try:
        for _ in range(2):
            tab=context.new_page()
            pages.append(tab)
            tab.add_init_script("localStorage.setItem('super-player:first-entry:v1','skip')")
            if static: tab.route("**/campaign/levels.json",lambda route:route.fulfill(json=LEVELS))
            tab.route(stage,storage_menu)
            tab.goto(stage)
            tab.wait_for_function("!!window.departure",polling=50,timeout=15000)
        first,peer=pages
        first.evaluate("""async () => {
          const store=await (await import('/campaign/store.mjs')).campaignStore();
          const {updateGear}=await import('/level-kit/src/gear.mjs');
          await updateGear(store,state=>{state.stock.medkit=80;state.items=['medkit',null]});
          const write=store.writeGear;
          store.writeGear=async data=>{
            const result=await write(data);
            store.writeGear=write;
            if(result.saved)throw Error('测试：出发回执中断');
            return result;
          };
          try {await departure.prepare();throw Error('未触发预期的回执中断');}
          catch(error){if(error.message!=='测试：出发回执中断')throw error;}
        }""")
        peer.evaluate("""() => {
          window.completedDepartures=0;window.departureError='';
          (async()=>{
            for(let i=0;i<32;i++){await departure.prepare();completedDepartures++;}
          })().catch(error=>{window.departureError='第 '+(completedDepartures+1)+'/32 次出发失败，'+error;});
        }""")
        for number in range(1,33):
            try:
                peer.wait_for_function("n=>completedDepartures>=n || departureError",arg=number,polling=50,timeout=15000)
            except PlaywrightTimeout as error:
                raise AssertionError(f"{backend} 配给压力第 {number}/32 次出发超时") from error
            failure=peer.evaluate("departureError")
            assert not failure,f"{backend} 配给压力{failure}"
        result=first.evaluate("""async () => {
          const store=await (await import('/campaign/store.mjs')).campaignStore();
          const before=(await store.gear()).state.stock.medkit,write=store.writeGear;
          let release,timer;
          const network=new Promise(resolve=>{release=resolve;});
          store.writeGear=data=>data.acknowledgePurchase?network.then(()=>write(data)):write(data);
          try {
            const kit=await Promise.race([departure.prepare(),new Promise((_,reject)=>{
              timer=setTimeout(()=>reject(Error('回收迟迟未完成，出发被阻塞')),6000);
            })]);
            return [before,(await store.gear()).state.stock.medkit,kit.counts.medkit];
          } finally {clearTimeout(timer);release();store.writeGear=write;}
        }""")
        assert result==[47,47,2],result
        print("PASS lost departure reply and 32 peer departures", backend, result,flush=True)
    finally:
        for tab in pages: tab.close()


def verify_endless_report(page, url, level):
    page.goto(f"{url}/{level}/")
    page.locator("#mission-mode").select_option("endless")
    page.locator("#start").click()
    page.wait_for_function("run.game.phase==='play'")
    kills = page.evaluate("""() => {
      const g=run.game,m=g.beasts, wave=m.pool.filter(b=>b.active && b.waveMember);
      if(wave.length!==run.config.beasts.population-1)throw Error('无尽首波数量错误');
      for(const b of wave)m.eject(b,g);
      g.step(.04);
      if(g.objective.wave!==2 || !m.boss.active)throw Error('首领仍在场时应按普通敌群清空结算波次');
      g.finish(false,'无尽撤出');
      return g.kills;
    }""")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.goto(url)
    page.locator("#continue").wait_for()
    saved = page.evaluate("""async () => {
      const store=await (await import('./campaign/store.mjs')).campaignStore();
      const {battles}=await store.progress();
      const saved=await store.report(battles[0].id);
      return [saved.kills,saved.report.mode,saved.report.scores.wave];
    }""")
    assert saved == [kills,"endless",2], saved


def run(browser, url, static, database):
    backend="IndexedDB" if static else "SQLite"
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
    # 已有玩家保留两种历史瞄准偏好，调整其他设置时应能原样回读。
    saved_mode = "toggle" if static else "hold"
    page.evaluate("""async mode => {
      const {preferences,storePreferences}=await import('./level-kit/src/preferences.mjs');
      storePreferences({...preferences(), aimMode:mode});
    }""", saved_mode)
    page.click("#mute")
    assert "已静音" in page.locator("#mute").inner_text()
    page.click("#settings-open")
    replay = page.get_by_label("录制战术回放")
    assert not replay.is_checked()
    assert not page.get_by_label("右键瞄准").is_visible()
    replay.check()
    peer = context.new_page()
    peer.goto(url)
    peer.click("#settings-open")
    peer.get_by_label("显示性能面板").check()
    peer.get_by_role("button",name="检视武器").click()
    peer.keyboard.press("j")
    peer.close()
    page.get_by_label("主音量").fill("47")
    page.get_by_label("切换音效", exact=True).click()
    page.keyboard.press("y")
    retained = page.evaluate("""async () => {
      const {preferences}=await import('./level-kit/src/preferences.mjs');
      const p=preferences();return [p.volume,p.metrics,p.keys.KeyI,p.keys.KeyM,p.aimMode];
    }""")
    assert retained == [47, True, "KeyJ", "KeyY", saved_mode], retained
    page.keyboard.press("Escape")
    page.click("#continue")
    page.wait_for_function("!!window.run")
    assert page.locator("#sound, #sound-state").count() == 0
    assert not page.evaluate("run.game.sound.enabled")
    assert not page.locator("#aim-help").is_visible()
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
    page.wait_for_function("run.game.sound.enabled && Math.abs(run.game.sound.main.gain.value-.47*.65)<.003")
    assert page.evaluate("run.config.audio.volume") == .47
    page.keyboard.press("j")
    assert page.evaluate("run.game.weapon.inspectTime > 0")
    page.mouse.down()
    page.wait_for_function("run.game.weapon.inspectTime === 0")
    page.mouse.up()
    page.evaluate("""() => {
      const g=run.game; g.time=3; g.player.x+=4; g.bossDead=true; g.core=true;
      g.journal.update(g); g.loot.push({name:'演练宝物',value:3000}); g.value=3000;
      g.kills=3; g.performance.weaponKills=2; g.performance.eliteKills=1; g.performance.shots=4; g.performance.hits=2; g.finish(true);
    }""")
    page.wait_for_function("document.querySelector('#menu-status').textContent.includes('已保存')")
    page.goto(url + "/#history")
    page.locator("#mute").filter(has_text="音效开启").wait_for()
    page.click("#mute")
    page.reload()
    page.locator("#mute").filter(has_text="已静音").wait_for()
    next_stage = url + "/" + LEVELS[1]["id"] + "/"
    page.route(next_stage, expose_game)
    page.goto(next_stage)
    page.click("#start")
    page.wait_for_function("run.game.phase==='play' && !run.game.sound.enabled && run.game.sound.main.gain.value===0")
    page.keyboard.press("y")
    page.wait_for_function("Math.abs(run.game.sound.main.gain.value-.47*.65)<.003")
    print("PASS settings, audio, first battle and next stage",backend,flush=True)
    page.goto(url + "/#history")
    page.get_by_role("button", name="查看战报").first.click()
    page.get_by_role("button", name="观看回放").click()
    page.locator(".replay-viewer canvas").wait_for()
    assert "演练宝物" in page.locator("#panel-body").inner_text()
    page.get_by_role("button", name="播放", exact=True).click()
    page.get_by_role("button", name="暂停", exact=True).click()
    page.get_by_label("回放进度").fill("2000")
    assert "击败首领" not in page.locator(".replay-viewer output").inner_text()
    page.get_by_role("button", name=re.compile("击败首领")).click()
    assert int(page.get_by_label("回放进度").input_value()) >= 3000
    assert "击败首领" in page.locator(".replay-viewer output").inner_text()
    page.get_by_label("回放进度").fill("0")
    assert "最近节点 出发" in page.locator(".replay-viewer output").inner_text()
    page.keyboard.press("Escape")
    page.click("#settings-open")
    page.get_by_label("录制战术回放").uncheck()
    page.keyboard.press("Escape")
    print("PASS recorded replay and chapter navigation",backend,flush=True)
    shop_url=url + "/" + level + "/"
    page.route(shop_url,storage_menu)
    page.goto(shop_url)
    page.locator("#preparation summary").click()
    page.select_option("#shop-item","grenade")
    page.evaluate("""async () => {
      const store=await (await import('/campaign/store.mjs')).campaignStore();
      const before=await store.gear(), write=store.writeGear;
      window.beforeBuy={spent:before.state.spent??0, stock:before.state.stock?.grenade??0};
      store.writeGear=async data=>{
        const result=await write(data);
        store.writeGear=write;
        if(result.saved){
          await new Promise(resolve=>{window.releaseReceipt=resolve;});
          throw Error('测试：已提交，回执中断');
        }
        return result;
      };
    }""")
    page.click("#shop-buy")
    page.wait_for_function("Boolean(window.releaseReceipt)")
    assert page.locator("#shop-buy").is_disabled() and page.locator("#start").is_disabled()
    page.locator("#shop-buy").evaluate("button=>button.click()")
    peer = context.new_page()
    if static:
        peer.route("**/campaign/levels.json", manifest)
    peer.route(shop_url,storage_menu)
    peer.goto(shop_url)
    peer.locator("#preparation summary").click()
    peer.select_option("#shop-item","grenade")
    # 旧窗口还没收到回执时，另一窗口连续完成 34 次合法兑换。
    buy=peer.locator("#shop-buy")
    credits=peer.locator("#credits")
    starting_balance=int(credits.inner_text().split()[-1])
    for number in range(1,35):
        try:
            buy.click(timeout=10000)
            peer.wait_for_function("!document.querySelector('#shop-item').disabled",polling=50,timeout=15000)
            status=peer.locator("#shop-status").inner_text(timeout=3000)
            balance=credits.inner_text(timeout=3000)
        except PlaywrightTimeout as error:
            raise AssertionError(f"{backend} 库存压力第 {number}/34 次兑换超时") from error
        assert status=="手雷兑换成功",f"{backend} 库存压力第 {number}/34 次兑换失败，{status}"
        assert balance==f"军需点 {starting_balance-number*60}",f"{backend} 第 {number}/34 次兑换后余额异常，{balance}"
    print("PASS 34 peer purchases with first receipt pending",backend,flush=True)
    def receipts():
        if not static:
            with closing(sqlite3.connect(database)) as db:
                return db.execute("SELECT COUNT(*) FROM pending_purchases").fetchone()[0]
        return page.evaluate("""() => new Promise((resolve,reject)=>{
          const req=indexedDB.open('super-player:/');
          req.onerror=reject;req.onsuccess=()=>{
            const db=req.result,count=db.transaction('settings').objectStore('settings')
              .count(IDBKeyRange.bound('purchase:','purchase;'));
            count.onsuccess=()=>{db.close();resolve(count.result);};count.onerror=reject;
          };
        })""")
    assert receipts() == 1
    peer.close()
    page.evaluate("window.releaseReceipt()")
    page.get_by_text("测试：已提交，回执中断",exact=True).wait_for()
    page.click("#shop-buy")
    page.get_by_text("手雷兑换成功",exact=True).wait_for()
    page.wait_for_function("!document.querySelector('#shop-item').disabled")
    delta = page.evaluate("""async () => {
      const store=await (await import('/campaign/store.mjs')).campaignStore();
      const {state}=await store.gear();return [state.spent-beforeBuy.spent,state.stock.grenade-beforeBuy.stock];
    }""")
    assert delta == [35*60,35] and receipts() == 0, delta
    page.unroute(shop_url,storage_menu)
    page.reload()
    page.locator("#preparation summary").click()
    page.select_option("#shop-item","grenade")
    page.click("#shop-buy")
    page.get_by_text("手雷兑换成功",exact=True).wait_for()
    page.wait_for_function("!document.querySelector('#shop-item').disabled")
    reloaded = page.evaluate("""async () => {
      const store=await (await import('/campaign/store.mjs')).campaignStore();
      const {state}=await store.gear();return state.spent;
    }""")
    assert reloaded == 36*60 and receipts() == 0, reloaded
    print("PASS receipt recovery and fresh purchase after reload",backend,flush=True)
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
      const before=await store.gear();
      const legacy={id:crypto.randomUUID(),level,won:true,endedAt:Date.now(),durationMs:500,kills:7,
        remaining:{grenade:2},loot:[{name:'旧宝物',value:3}]};
      await Promise.all([store.save(legacy),store.save(legacy)]);
      const state=await store.progress(), old=await store.report(legacy.id);
      const failed=await store.report(state.battles.find(row=>row.id!==legacy.id).id);
      const rows=await store.statistics(); const recorded=(await Promise.all(state.battles.map(b=>store.report(b.id)))).find(r=>r.hasReplay);
      const after=await store.gear();
      return {count:state.battleCount,old,failed,total:rows.reduce((s,r)=>s+r.kills,0),
              stockGain:after.state.stock.grenade-(before.state.stock?.grenade??0),creditGain:after.earned-before.earned,
              elite:rows.reduce((sum,r)=>sum+(r.eliteKills??0),0),recorded:recorded.id};
    }""")
    assert detail["count"] == 4 and detail["total"] == 10, detail
    assert detail["elite"] == 1, detail
    assert (detail["stockGain"],detail["creditGain"]) == (2,3), detail
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
    print("PASS settlement, replay quota failure and legacy report",backend,flush=True)
    departure_retry(context,url,static)
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
    verify_endless_report(page,url,level)
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
                    legacy_sqlite(browser,url,Path(tmp)/"test.sqlite")
                    print("PASS legacy SQLite progress, gear, weapon and report", flush=True)
                    blocked_legacy_upgrade(browser,url)
                    print("PASS blocked v1 IndexedDB upgrade resumes and retains history",flush=True)
                    for static in (False, True):
                        run(browser,url,static,Path(tmp)/"test.sqlite")
                        print("PASS battle report / replay / mute / counter", "IndexedDB" if static else "SQLite", flush=True)
                finally:
                    browser.close()
        finally:
            proc.terminate()
            proc.wait()
