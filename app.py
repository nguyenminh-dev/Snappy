import os, json, asyncio
from TikTokApi import TikTokApi

VIDEO_URL = "https://www.tiktok.com/@chucareviewkhongbooking/video/7516680377256201490?q=k%C3%ADnh%20m%E1%BA%AFt%20nam&t=1759228599615"

async def main():
    ms_token = os.getenv("ms_token")
    headless = os.getenv("headless", "True").lower() == "true"
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
        data = await video.info()
        print(json.dumps(data, indent=4, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
