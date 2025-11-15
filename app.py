from datetime import datetime
import os, json, asyncio
from TikTokApi import TikTokApi

SESSION_FILE = "tiktok_session.json"
VIDEO_URL = "https://www.tiktok.com/@nminhdev/video/7520912125636791559"


def load_session(filename=SESSION_FILE):
    if not os.path.exists(filename):
        raise Exception("❌ Không tìm thấy file session, hãy chạy sign_in() trước")
    
    with open(filename, "r", encoding="utf-8") as f:
        return json.load(f)["data"]

def save_session(data, filename=SESSION_FILE):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump({
            "saved_at": datetime.now().isoformat(),
            "data": data
        }, f, ensure_ascii=False, indent=4)
    print(f"✅ Session saved to: {filename}")


async def sign_in():
    ms_token = os.getenv("ms_token")
    headless = False
    browser = os.getenv("TIKTOK_BROWSER", "chromium")

    api = TikTokApi()

    async with api:
        await api.create_sessions(
            ms_tokens=[ms_token],
            num_sessions=1,
            sleep_after=3,
            browser=browser,
            headless=headless,
            suppress_resource_load_types=["image", "media", "font", "stylesheet"],
        )

        await api.ensure_login()
        is_logged_in = await api.is_logged_in()
        print("🔹 Logged in:", is_logged_in)

        if not is_logged_in:
            print("❌ Không đăng nhập được.")
            return

        session = api.sessions[0]
        context = session.context
        page = session.page   # <<< Lấy page ở đây

        # --- Cookies ---
        cookies = await context.cookies()

        # --- Storage state ---
        storage_state = await context.storage_state()

        # --- msToken ---
        jar = {c["name"]: c["value"] for c in cookies}
        ms_token_extracted = jar.get("msToken") or jar.get("ms_token") or ms_token

        # --- User agent (FIXED) ---
        user_agent = await page.evaluate("() => navigator.userAgent")

        # Save session
        save_session({
            "ms_token": ms_token_extracted,
            "cookies": cookies,
            "storage_state": storage_state,
            "user_agent": user_agent,
            "browser": browser,
            "headless": headless
        })


async def post_comment_with_saved_session(text="Hello from saved session!"):
    session_data = load_session()

    ms_token = session_data["ms_token"]
    browser = session_data["browser"]
    headless = session_data["headless"]
    cookies = session_data["cookies"]

    api = TikTokApi()

    async with api:
        await api.create_sessions(
            ms_tokens=[ms_token],
            num_sessions=1,
            sleep_after=3,
            browser=browser,
            headless=headless,
            suppress_resource_load_types=["image","media","font","stylesheet"],
        )

        # lấy session đầu tiên
        session = api.sessions[0]
        context = session.context

        # nạp lại cookie
        try:
            await context.add_cookies(cookies)
            print("🍪 Cookies loaded vào browser context.")
        except Exception as ex:
            print("⚠️ Không set được cookie:", ex)

        # kiểm tra login bằng cookie
        logged_in = await api.is_logged_in()
        print("🔹 Logged in bằng session cũ:", logged_in)

        if not logged_in:
            print("❌ Session không hợp lệ, bạn phải sign_in() lại để tạo session mới.")
            return
        
        # comment video
        video = api.video(url=VIDEO_URL)
        await video.info()  # nạp session vào video

        print("✏️ Đang post comment...")
        res = await video.post_comment(text)
        print("✅ Result:", res)


async def main():
    # await sign_in()
    await post_comment_with_saved_session("Comment bằng session cũ nè!")


if __name__ == "__main__":
    asyncio.run(main())
