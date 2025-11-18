from datetime import datetime
import os, json, asyncio
from services.ApiTiktok.tiktok import ApiTiktok

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

async def build_tiktok_session_payload(username):
    ms_token = os.getenv("ms_token")
    headless = False
    browser = os.getenv("TIKTOK_BROWSER", "chromium")

    api = ApiTiktok()

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
        return {
            "ms_token": ms_token_extracted,
            "cookies": cookies,
            "storage_state": storage_state,
            "user_agent": user_agent,
            "browser": browser,
            "headless": headless,
            "tiktok_name": username
        }

async def sign_in(username):
    """
    Hàm giữ lại cho mục đích test, vẫn lưu session ra file JSON.
    Ứng dụng chính nên gọi build_tiktok_session_payload() và lưu vào DB.
    """
    payload = await build_tiktok_session_payload(username)
    save_session(payload)

async def post_comment_with_saved_session(session_data, text, video_url):
    """
    Post comment vào TikTok video sử dụng session đã lưu.
    
    Args:
        session_data: Dict chứa thông tin session (ms_token, cookies, browser, headless)
        text: Nội dung comment
        video_url: URL của video TikTok cần comment
    
    Returns:
        Dict kết quả từ TikTok API hoặc None nếu lỗi
    """
    ms_token = session_data.get("ms_token")
    browser = session_data.get("browser", "chromium")
    headless = session_data.get("headless", False)
    cookies = session_data.get("cookies", [])

    api = ApiTiktok()

    async with api:
        await api.create_sessions(
            ms_tokens=[ms_token] if ms_token else None,
            num_sessions=1,
            sleep_after=5,
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
            raise Exception("❌ Session không hợp lệ, bạn phải sign_in() lại để tạo session mới.")
        
        # comment video
        video = api.video(url=video_url)
        await video.info()  # nạp session vào video

        print("✏️ Đang post comment...")
        res = await video.post_comment(text)
        print("✅ Result:", res)
        return res

async def main():
    await sign_in("mideframe")
    # await post_comment_with_saved_session("Comment bằng session cũ nè 17/11! 1")

if __name__ == "__main__":
    asyncio.run(main())
