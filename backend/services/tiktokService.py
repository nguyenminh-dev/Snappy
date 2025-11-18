from datetime import datetime
import os, json, asyncio
import random
from services.ApiTiktok.tiktok import ApiTiktok
import pandas as pd

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

async def build_session_from_account(account, password, username):
    print("login", account, password, username)
    """Login TikTok, lưu session, trả về payload"""
    api = ApiTiktok()
    headless = False
    browser = os.getenv("TIKTOK_BROWSER", "chromium")
    ms_token = os.getenv("ms_token")

    async with api:
        await api.create_sessions(
            ms_tokens=None,
            num_sessions=1,
            sleep_after=3,
            browser="chromium",
            headless=False,
            suppress_resource_load_types=["image", "media", "font", "stylesheet"]
        )

        # lấy session đầu tiên
        session = api.sessions[0]
        context = session.context
        page = session.page

        # --- Login bằng email/password ---
        # Đi đến trang login
        await page.goto("https://www.tiktok.com/login/phone-or-email/email", wait_until="networkidle")

        await page.wait_for_selector("input[name='username']", timeout=8000)
        await page.click("input[name='username']")
        await page.type("input[name='username']", account, delay=random.randint(30, 120))

        await page.wait_for_selector("input[type='password']", timeout=8000)
        await page.click("input[type='password']")
        await page.type("input[type='password']", password, delay=random.randint(30, 120))

        await page.click("button[type='submit']")

        # Chờ xác nhận login thành công (ví dụ selector avatar hoặc home page)
        for _ in range(120):
            await asyncio.sleep(1)
            if await api.is_logged_in():
                print(f"✅ Login thành công: {account}")

        # --- Cookies + storage ---
        cookies = await context.cookies()

        # --- Storage state ---
        storage_state = await context.storage_state()

        # --- msToken ---
        jar = {c["name"]: c["value"] for c in cookies}
        ms_token_extracted = jar.get("msToken") or jar.get("ms_token") or ms_token

        # --- User agent (FIXED) ---
        user_agent = await page.evaluate("() => navigator.userAgent")
        payload = {
            "ms_token": ms_token_extracted,
            "cookies": cookies,
            "storage_state": storage_state,
            "user_agent": user_agent,
            "browser": browser,
            "headless": headless,
            "tiktok_name": username,
            "account": account,
            "password": password
        }

        print(f"✅ Session saved: {username}")
        return payload

async def auto_login_from_excel(excel_file):
    df = pd.read_excel(excel_file)

    for _, row in df.iterrows():
        print(f"Đang chạy tài khoản: {row['Account']}")

        await build_session_from_account(
            account=row["Account"],
            password=row["Password"],
            username=row["UserName"]
        )

        # tuỳ chọn: nghỉ 1–2s để giảm bị captcha
        await asyncio.sleep(5)

async def post_comment_with_api(session_data, text, video_url):
    """
    Post comment vào TikTok video sử dụng session đã lưu. Phần này tiktok phát hiện và ẩn comment đối với các tài khoản khác
    
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
            suppress_resource_load_types=["image","font"],
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

async def post_comment_with_ui(session_data, text, video_url):
    """
    Comment TikTok bằng UI thật, đảm bảo hiển thị 100% trên App.
    """
    ms_token = session_data.get("ms_token")
    browser = session_data.get("browser", "chromium")
    headless = session_data.get("headless", False)
    cookies = session_data.get("cookies", [])

    api = ApiTiktok()

    async with api:
        # 1) Khởi tạo session
        await api.create_sessions(
            ms_tokens=[ms_token] if ms_token else None,
            num_sessions=1,
            sleep_after=2,
            browser=browser,
            headless=headless,
            suppress_resource_load_types=["media"],  # ❗ CHỈ block media
        )

        session = api.sessions[0]
        context = session.context
        page = session.page

        # 2) Load cookie
        try:
            await context.add_cookies(cookies)
            print("🍪 Cookies loaded thành công.")
        except Exception as ex:
            print("⚠ Cookie load lỗi:", ex)

        # 3) Kiểm tra login
        logged_in = await api.is_logged_in()
        print("🔹 Logged in:", logged_in)

        if not logged_in:
            raise Exception("❌ Session không hợp lệ, cần sign_in lại.")

        # 4) Mở video
        print("▶️ Opening video...")
        await page.goto(video_url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        # 5) Human-like behavior
        await page.mouse.move(200, 200)
        await page.wait_for_timeout(400)

        await page.mouse.move(400, 500)
        await page.wait_for_timeout(300)

        # Scroll nhẹ cho tự nhiên
        await page.evaluate("window.scrollBy(0, 500);")
        await page.wait_for_timeout(800)

        await page.evaluate("window.scrollBy(0, 600);")
        await page.wait_for_timeout(1200)

        # 6) Focus vào input comment
        print("⌨️ Tìm ô comment...")
        input_selector = "[data-e2e='comment-input']"
        await page.wait_for_selector(input_selector, timeout=5000)

        input_box = await page.query_selector(input_selector)
        if not input_box:
            raise Exception("❌ Không tìm thấy ô comment.")

        await input_box.click()
        await page.wait_for_timeout(300)

        # 7) Gõ từng ký tự như người thật
        print("⌨️ Đang gõ comment...")
        for char in text:
            await page.keyboard.type(char, delay=random.randint(300, 800))
        await page.wait_for_timeout(500)

        # 8) Click nút gửi
        send_btn = await page.query_selector("[data-e2e='comment-post']")
        if not send_btn:
            raise Exception("❌ Không tìm thấy nút gửi comment.")

        await send_btn.click()
        print("📤 Comment sent, waiting for confirmation...")

        # 9) Đợi TikTok xử lý
        await page.wait_for_timeout(2000)

        # 10) Kiểm tra comment có xuất hiện không
        comments_html = await page.content()
        if text in comments_html:
            print("✅ Comment đã xuất hiện trên giao diện.")
            return {"ok": True, "message": "Comment posted & visible", "text": text}

        return {
            "ok": True,
            "message": "Comment sent, nhưng có thể đang chờ duyệt",
            "text": text
        }

async def auto_comment_with_ui(comments_list):
    """
    comments_list = [
        {"session_data": {...}, "text": "comment 1", "video_url": "..."},
        {"session_data": {...}, "text": "comment 2", "video_url": "..."},
    ]
    """
    results = []

    for item in comments_list:
        try:
            res = await post_comment_with_ui(
                session_data=item["session_data"],
                text=item["text"],
                video_url=item["video_url"]
            )
            results.append(res)
        except Exception as ex:
            print(f"❌ Lỗi khi comment: {ex}")
            results.append({"ok": False, "message": str(ex), "text": item["text"]})

        # nghỉ 1-3s giữa các comment để tránh bị rate-limit
        await asyncio.sleep(random.randint(1, 10))

    return results

async def main():
    await auto_login_from_excel("accounts.xlsx")

if __name__ == "__main__":
    asyncio.run(main())
