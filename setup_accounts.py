# setup_accounts.py (version robust)
import os, json, asyncio, pathlib, re
from typing import List, Dict, Any, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

ACCOUNTS_DIR = pathlib.Path("accounts")
ACCOUNTS_DIR.mkdir(exist_ok=True)

ACCOUNTS_TO_SETUP = [
    {"alias": "acc01", "proxy": None},
    {"alias": "acc02", "proxy": None},
]

LOGIN_URL = "https://www.tiktok.com/login"
HOMEPAGE = "https://www.tiktok.com/"

def cookie_jar(cookies: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {c["name"]: c for c in cookies}

def is_login_cookie_present(jar: Dict[str, Dict[str, Any]]) -> bool:
    # Mềm dẻo hơn: chấp nhận nhiều biến thể cookie của TikTok
    auth_ok = any(n in jar for n in ["sessionid", "sid_guard", "sid_tt", "sessionid_ss"])
    return auth_ok

def has_csrf(jar: Dict[str, Dict[str, Any]]) -> bool:
    return ("tt_csrf_token" in jar) or ("tt-csrf-token" in jar)

async def wait_for_new_page(context: BrowserContext, timeout_ms: int = 10000) -> Optional[Page]:
    # Nếu TikTok mở tab/popup mới khi hoàn tất đăng nhập, theo dõi tab đó
    fut = asyncio.get_event_loop().create_future()

    def on_page(page: Page):
        if not fut.done():
            fut.set_result(page)

    context.on("page", on_page)
    try:
        return await asyncio.wait_for(fut, timeout=timeout_ms / 1000)
    except asyncio.TimeoutError:
        return None
    finally:
        try:
            context.off("page", on_page)  # type: ignore
        except Exception:
            pass

async def capture_account(alias: str, proxy: Optional[str] = None):
    async with async_playwright() as p:
        launch_args = {"headless": False}
        if proxy:
            launch_args["proxy"] = {"server": proxy}

        browser: Browser = await p.chromium.launch(**launch_args)
        context: BrowserContext = await browser.new_context()
        page: Page = await context.new_page()

        print(f"[{alias}] Mở trang đăng nhập…")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded")

        # Đôi khi TikTok hoàn tất đăng nhập ở tab khác → theo dõi trang mới
        new_page_task = asyncio.create_task(wait_for_new_page(context, timeout_ms=15000))

        # Vòng chờ đăng nhập: log cookie mỗi 2s
        logged_in = False
        for sec in range(240):  # tối đa 4 phút
            await asyncio.sleep(2)
            # nếu có trang mới, chuyển page sang trang đó
            if not new_page_task.done():
                pass
            else:
                new_pg = new_page_task.result()
                if new_pg:
                    print(f"[{alias}] Phát hiện tab mới sau đăng nhập → chuyển sang tab đó")
                    page = new_pg

            cookies = await context.cookies()
            jar = cookie_jar(cookies)
            print(f"[{alias}] Đang chờ đăng nhập… ({len(jar)} cookies) | keys: {list(jar.keys())[:6]}...")

            if is_login_cookie_present(jar):
                logged_in = True
                break

            # Một số trường hợp cần refresh lại QR login sau ~60–90s
            if sec in (90, 150):
                print(f"[{alias}] Làm mới trang đăng nhập (có thể QR hết hạn).")
                await page.goto(LOGIN_URL, wait_until="domcontentloaded")

        if not logged_in:
            await browser.close()
            raise RuntimeError(f"[{alias}] Timeout: chưa thấy cookie đăng nhập sau khi quét QR.")

        # Đảm bảo csrf: ghé homepage để tt_csrf_token xuất hiện
        print(f"[{alias}] Đăng nhập xong. Điều hướng về homepage để lấy tt_csrf_token…")
        await page.goto(HOMEPAGE, wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")

        # Kiểm tra lại cookies + csrf
        cookies = await context.cookies()
        jar = cookie_jar(cookies)
        if not has_csrf(jar):
            print(f"[{alias}] Chưa thấy tt_csrf_token, refresh homepage lần nữa…")
            await page.goto(HOMEPAGE, wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle")
            cookies = await context.cookies()
            jar = cookie_jar(cookies)

        # Lưu storage_state
        storage_state = await context.storage_state()
        ms_token = (jar.get("msToken", {}) or jar.get("ms_token", {})).get("value")

        save_path = ACCOUNTS_DIR / f"{alias}.json"
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "alias": alias,
                    "proxy": proxy,
                    "storage_state": storage_state,
                    "ms_token": ms_token,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        print(f"[{alias}] ✅ Đã lưu state vào: {save_path}")
        await browser.close()

async def main():
    for acc in ACCOUNTS_TO_SETUP:
        try:
            await capture_account(acc["alias"], acc.get("proxy"))
        except Exception as e:
            print(f"[{acc['alias']}] LỖI: {e}")

if __name__ == "__main__":
    asyncio.run(main())
