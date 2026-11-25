"""以真实结算数据核对功能路由、材料条件和三个独立存档。"""

from playwright.sync_api import expect


def verify_function_pages(browser, url, static):
    context = browser.new_context(viewport={"width": 960, "height": 540})
    page = context.new_page()
    if static:
        def manifest(route):
            response = route.fetch()
            headers = {k: v for k, v in response.headers.items() if k.lower() != "x-super-player-store"}
            route.fulfill(status=200, headers=headers, body=response.body())
        context.route("**/campaign/levels.json", manifest)
    vendors = []
    page.on("request", lambda r: vendors.append(r.url) if r.url.endswith("three-r160.js") else None)
    page.goto(url)
    ids = []
    for stages in (3, 1, 0):
        slot = page.evaluate("""async () => {
          const p = await import('./campaign/profiles.mjs');
          p.createProfile();
          return p.activeProfile();
        }""")
        ids.append(slot)
        page.reload()
        page.locator("#continue").wait_for()
        if stages:
            page.evaluate("""async stages => {
              const store = await (await import('./campaign/store.mjs')).campaignStore();
              for (const level of store.levels.slice(0, stages)) {
                const loot = stages === 3
                  ? [{name:'传奇·试验藏品',value:1550},{name:'精英改装材料·穿透弹芯',value:520}]
                  : [{name:'普通藏品',value:430}];
                await store.save({id:crypto.randomUUID(),level:level.id,won:true,kills:stages,
                  durationMs:500,endedAt:Date.now(),loot});
              }
              if (stages === 1) {
                const {updateGear,requisition} = await import('./level-kit/src/gear.mjs');
                await updateGear(store,(state,latest)=>requisition(state,'pierce',latest.earned,{},store.levels[0].id));
              } else {
                for (let i=0;i<23;i++) await store.save({id:crypto.randomUUID(),level:store.levels[0].id,
                  won:false,kills:0,durationMs:100,endedAt:Date.now(),loot:[]});
              }
            }""", stages)
    page.goto(url + "/#saves")
    expect(page.locator(".save-list li")).to_have_count(4)
    first, second, empty = ids
    for slot, cleared, battles in [(first,3,26), (second,1,1), (empty,0,0)]:
        if slot != page.get_by_label("切换存档").input_value():
            page.get_by_label("切换存档").select_option(slot)
        current = page.locator(".save-list li").filter(has_text="当前存档")
        expect(current).to_contain_text(f"通关 {cleared} /")
        expect(current).to_contain_text(f"已结算 {battles} 局")
        page.get_by_role("link", name="查看存档记录").click()
        expect(page.locator("#battle-count")).to_have_text(f"共 {battles} 局")
        page.get_by_role("link", name="返回存档管理").click()
        page.get_by_role("link", name="返回主菜单").click()
        page.get_by_role("link", name="成就与统计", exact=True).click()
        expect(page.locator("#function-body")).to_contain_text(f"累计对战 {battles} 局")
        page.get_by_role("link", name="返回主菜单").click()
        page.get_by_role("link", name="战场图鉴",exact=True).click()
        page.get_by_role("link", name="战利品图鉴",exact=True).click()
        if slot == first:
            expect(page.locator("#legendary-count")).to_contain_text("传奇·试验藏品")
            expect(page.locator(".loot-card").filter(has_text="传奇·试验藏品")).to_contain_text("已带回 1 次")
            expect(page.locator(".loot-card").filter(has_text="传奇·试验藏品")).to_contain_text("1,550")
            page.select_option("#collection-level", "*")
            expect(page.locator(".loot-card.discovered")).to_have_count(6)
            expect(page.locator("#legendary-count")).to_contain_text("雨夜废城")
            page.select_option("#collection-level", "rain-city")
            expect(page.locator(".loot-card.discovered")).to_have_count(2)
        elif slot == second:
            expect(page.locator(".loot-card.discovered")).to_have_count(1)
            expect(page.locator("#legendary-count")).to_contain_text("尚未发现")
        else:
            expect(page.locator(".loot-card.discovered")).to_have_count(0)
            expect(page.locator(".undiscovered").first).to_have_text("未发现")
        page.goto(url + "/#saves")
    assert not vendors, vendors
    page.get_by_label("切换存档").select_option(first)
    expect(page.locator(".save-list li").filter(has_text="当前存档")).to_contain_text("已结算 26 局")
    page.goto(url + "/#history")
    page.click("#more-battles")
    details = page.get_by_role("link", name="查看战报")
    expect(details).to_have_count(26)
    details.last.scroll_into_view_if_needed()
    details.last.click()
    expect(page.locator("#function-body")).to_contain_text("本局没有录制回放")
    page.reload()
    page.get_by_role("link",name="返回对战记录").click()
    expect(details).to_have_count(26)
    expect(details.last).to_be_focused()
    assert page.locator("#history-region").evaluate("el=>el.scrollTop") > 0
    page.goto(url+"/#collection")
    assert page.locator("#view-collection .loot-section").count() == 0
    page.locator("#weapon-customize summary").click()
    for weapon, branch in [("underground-lab","长枪管"),("shotgun-pump","快换弹匣")]:
        page.locator(f'[data-weapon-id="{weapon}"]').click()
        page.click("#rifle-equip")
        expect(page.locator("#rifle-equip")).to_have_text("已佩戴")
        page.locator("#weapon-mod-slots button").filter(has_text=branch).click()
        expect(page.locator("#weapon-mod-slots button").filter(has_text=branch)).to_contain_text("已选")
    source = page.get_by_role("link",name="穿透弹芯来源")
    expect(source.locator("..")).to_contain_text("累计带回 3 枚")
    source.click()
    expect(page.locator("#function-body")).to_contain_text("精英凶兽有机会掉落")
    page.reload()
    page.get_by_role("link",name="返回穿透弹改装").click()
    expect(page.locator('[data-weapon-id="shotgun-pump"]')).to_have_attribute("aria-pressed","true")
    expect(source).to_be_visible()
    page.goto(url + "/#saves")
    page.get_by_label("切换存档").select_option(second)
    expect(page.locator(".save-list li").filter(has_text="当前存档")).to_contain_text("已结算 1 局")
    page.goto(url + "/#collection")
    expect(page.locator("#rifle-equipped")).to_contain_text("关卡默认")
    page.locator("#weapon-customize summary").click()
    expect(source.locator("..")).to_contain_text("累计带回 0 枚")
    expect(source.locator("..")).to_contain_text("已解锁")
    page.goto(url + "/#menu")
    for width in (1280,390):
        page.set_viewport_size({"width":width,"height":760})
        for selector, title in [
            ('nav [href="#missions"]',"战役大厅"),("#training-open","训练"),('nav [href="#collection"]',"军械库"),
            ('nav [href="#codex"]',"战场图鉴"),('nav [href="#history"]',"对战记录"),
            ('nav [href="#stats"]',"成就与统计"),("#settings-open","游戏设置"),
            ("#manage-saves","存档管理"),("#save-open","存档管理"),
        ]:
            opener = page.locator(selector)
            opener.focus()
            page.keyboard.press("Enter")
            expect(page.get_by_role("heading",name=title,level=1,exact=True)).to_be_visible()
            page.go_back()
            expect(opener).to_be_focused()
            page.go_forward()
            page.get_by_role("link",name="返回主菜单").click()
            expect(opener).to_be_focused()
    print("PASS 功能页、三级导航、桌面及紧凑键盘往返、分页位置、双枪改装、材料收藏、三存档", "IndexedDB" if static else "SQLite", flush=True)
    context.close()
