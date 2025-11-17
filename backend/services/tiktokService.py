from datetime import datetime
import os, json, asyncio
from TikTokApi import TikTokApi

SESSION_FILE = "tiktok_session.json"
VIDEO_URL = "https://www.tiktok.com/@nminhdev/video/7520912125636791559"


def load_session(filename=SESSION_FILE):
    """
    Hàm tạm dùng để test với file JSON (cũ).
    Ứng dụng chính nên dùng TikTokSession trong database.
    """
    if not os.path.exists(filename):
        raise Exception("❌ Không tìm thấy file session, hãy chạy sign_in() trước")

    with open(filename, "r", encoding="utf-8") as f:
        return json.load(f)["data"]


def save_session(data, filename=SESSION_FILE):
    """
    Hàm tạm dùng để test với file JSON (cũ).
    """
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(
            {"saved_at": datetime.now().isoformat(), "data": data},
            f,
            ensure_ascii=False,
            indent=4,
        )
    print(f"✅ Session saved to: {filename}")

async def build_tiktok_session_payload():
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

        # Lấy thông tin user đang đăng nhập
        username = "MideFrame"
        user = api.user(username=username)
        await user.info()

        # Save session
        save_session({
            "context": context,
            "ms_token": ms_token_extracted,
            "cookies": cookies,
            "storage_state": storage_state,
            "user_agent": user_agent,
            "username": user.username,
            "user_id": user.user_id,
            "sec_uid": user.sec_uid,
            "browser": browser,
            "headless": headless,
        })

async def sign_in():
    """
    Hàm giữ lại cho mục đích test, vẫn lưu session ra file JSON.
    Ứng dụng chính nên gọi build_tiktok_session_payload() và lưu vào DB.
    """
    payload = await build_tiktok_session_payload()
    save_session(payload)

async def post_comment_with_saved_session(text):
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
            sleep_after=5,
            browser=browser,
            headless=True,
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

# async def post_comment_with_new():
#     ms_token = os.getenv("ms_token")
#     # headless = os.getenv("headless", "True").lower() == "true"
#     headless = False
#     browser = os.getenv("TIKTOK_BROWSER", "chromium")

#     api = TikTokApi()
#     async with api:
#         await api.create_sessions(
#             ms_tokens=[ms_token],
#             num_sessions=1,
#             sleep_after=3,
#             browser=browser,
#             headless=headless,
#             suppress_resource_load_types=["image","media","font","stylesheet"],
#         )
#         video = api.video(url=VIDEO_URL)
#         # Quan trọng: nạp info để lấy cookies + context đúng cho trang video
#         await video.info()
#         # async for comment in video.comments(count=100):
#         #     print(comment)

#         await api.ensure_login()
#         print("🔹 Logged in:", await api.is_logged_in())
#         res = await video.post_comment("Comment bằng new session nè!")
#         print(res)

async def main():
    await sign_in()
    # await post_comment_with_saved_session("Comment bằng session cũ nè 17/11! 1")

if __name__ == "__main__":
    asyncio.run(main())
