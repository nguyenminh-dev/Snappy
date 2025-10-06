import os, json, asyncio
from datetime import datetime
from TikTokApi import TikTokApi

VIDEO_URL = "https://www.tiktok.com/@nminhdev/video/7520912125636791559"
COMMENT_TEXT = "minh dev day ne"
def save_json(data, filename="data.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump({
            "fetched_at": datetime.now().isoformat(),
            "source_url": VIDEO_URL,
            "data": data
        }, f, ensure_ascii=False, indent=4)

async def main():
    ms_token = os.getenv("ms_token")
    # headless = os.getenv("headless", "True").lower() == "true"
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
            suppress_resource_load_types=["image","media","font","stylesheet"],
        )
        video = api.video(url=VIDEO_URL)
        # Quan trọng: nạp info để lấy cookies + context đúng cho trang video
        await video.info()
        # async for comment in video.comments(count=100):
        #     print(comment)

        await api.ensure_login()
        print("🔹 Logged in:", await api.is_logged_in())
        res = await video.post_comment(COMMENT_TEXT)
        print(res)
        
if __name__ == "__main__":
    asyncio.run(main())