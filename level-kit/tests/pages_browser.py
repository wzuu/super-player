"""从公开 Pages 首页进入教程、试验场及第一关，核对 main 产物与刷新后的本机战役进度。"""
import argparse
from hashlib import sha256
import os
import re
import time
from urllib.parse import urlsplit

from playwright.sync_api import Error, sync_playwright
from lab_live_browser import verify as play_campaign, watch_page


def wait_for_release(request, documents):
    deadline = time.monotonic() + 120
    observed = {}
    while time.monotonic() < deadline:
        for url, digest in documents.items():
            timeout = max(1, min(8000, int((deadline - time.monotonic()) * 1000)))
            try:
                response = request.get(url, timeout=timeout)
                try:
                    observed[url] = (sha256(response.body()).hexdigest()
                                     if response.ok and response.url == url else (response.status, response.url))
                finally:
                    response.dispose()
            except Error as exc:
                observed[url] = str(exc)
        if observed == documents:
            return
        time.sleep(min(5, max(0, deadline - time.monotonic())))
    raise RuntimeError(f"120 秒内公开文档未匹配预期 main 构建：{observed}")


def check_document(response, url, digest):
    assert response and response.ok and response.url == url, (url, response and response.url)
    actual = sha256(response.body()).hexdigest()
    assert actual == digest, (url, "期望/实际 SHA-256", digest, actual)
    print("PASS", url, actual, flush=True)


def smoke(browser, root, home_digest, level_digest):
    page = browser.new_page(viewport={"width": 960, "height": 620})
    page.add_init_script("localStorage.setItem('super-player:preferences:v1',JSON.stringify({muted:true}))")
    errors, loaded = [], set()
    watch_page(page, errors, static=True)

    def response_seen(response):
        if not response.url.startswith(root):
            return
        if response.status >= 400:
            errors.append(f"HTTP {response.status} {response.url}")
        elif response.ok:
            loaded.add(response.url)

    page.on("response", response_seen)
    page.on("requestfailed", lambda req: errors.append(f"{req.failure} {req.url}")
            if req.resource_type in {"document", "script", "stylesheet"} and req.failure != "net::ERR_ABORTED" else None)
    try:
        check_document(page.goto(root), root, home_digest)
        page.get_by_role("button", name="直接开始", exact=True).click()
        page.locator("#continue").wait_for()
        for mode, name, objective in (("tutorial", "新手教程", "转向"), ("range", "火力试验场", "第 1 波")):
            page.get_by_role("link", name=name, exact=True).click()
            page.wait_for_url(root + "practice/index.html?mode=" + mode)
            page.locator("#start").click()
            page.locator("#hud").wait_for()
            page.wait_for_function("text=>document.querySelector('#objective').textContent.includes(text)", arg=objective)
            assert page.evaluate("document.pointerLockElement && levelThreeExports.three.REVISION") == "160"
            if mode == "tutorial":
                page.mouse.move(520, 320)
                page.mouse.move(580, 341)
                page.wait_for_function("document.querySelector('#objective').textContent.includes('四个方向')")
                for key in ("w", "a", "s", "d"):
                    page.keyboard.down(key)
                    page.wait_for_timeout(250)
                    page.keyboard.up(key)
                page.wait_for_function("document.querySelector('#objective').textContent.includes('冲刺')")
            else:
                ammo = int(page.locator("#ammo").inner_text())
                page.mouse.down()
                try:
                    page.wait_for_function("n=>Number(document.querySelector('#ammo').textContent)<n", arg=ammo)
                finally:
                    page.mouse.up()
            page.evaluate("document.exitPointerLock()")
            page.locator("#campaign-home").click()
            page.locator("#continue").wait_for()
            print("PASS", name, "进入游戏并返回战役首页", flush=True)

        level_url = root + "underground-lab/"
        with page.expect_navigation(wait_until="load") as navigation:
            page.locator("#continue").click()
        check_document(navigation.value, level_url, level_digest)
        page.locator("#start").click()
        page.locator("#hud").wait_for()
        assert page.evaluate("levelThreeExports.three.REVISION") == "160"
        for path in ("campaign/levels.json", "campaign/images/underground-lab.webp", "level-kit/vendor/three-r160.js"):
            assert root + path in loaded, (path, sorted(loaded))
        assert not errors, errors
        print("PASS 公开原版第一关进入游戏，资源由仓库子路径加载，Three.js r160", flush=True)
    finally:
        page.close()
    play_campaign(browser, root, static=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="公开试玩首页，如 https://wzuu.github.io/super-player/")
    parser.add_argument("--home-sha256", required=True, help="对应 main 构建产物 index.html 的 SHA-256")
    parser.add_argument("--level-sha256", required=True, help="同次构建 underground-lab/index.html 的 SHA-256")
    args = parser.parse_args()
    parsed = urlsplit(args.url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        parser.error("请传入公开 HTTPS 首页目录")
    if not all(re.fullmatch(r"[0-9a-fA-F]{64}", h) for h in (args.home_sha256, args.level_sha256)):
        parser.error("两个 SHA-256 摘要都必须是 64 位十六进制")
    root = args.url.rstrip("/") + "/"
    with sync_playwright() as pw, pw.chromium.launch(channel=os.environ.get("GAME_TEST_BROWSER", "chrome"),
                                                      headless=True) as browser:
        home_digest, level_digest = args.home_sha256.lower(), args.level_sha256.lower()
        request = pw.request.new_context()
        try:
            wait_for_release(request, {root:home_digest, root + "underground-lab/":level_digest})
        finally:
            request.dispose()
        smoke(browser, root, home_digest, level_digest)


if __name__ == "__main__":
    main()
