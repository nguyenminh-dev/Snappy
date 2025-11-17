import asyncio
import logging
import dataclasses
from typing import Any
import random
import time
import json
from playwright.async_api import async_playwright, TimeoutError
from urllib.parse import urlencode, quote, urlparse
from .stealth import stealth_async
from .helpers import random_choice

from .api.user import User
from .api.video import Video
from .api.sound import Sound
from .api.hashtag import Hashtag
from .api.comment import Comment
from .api.trending import Trending
from .api.search import Search
from .api.playlist import Playlist

from .exceptions import (
    InvalidJSONException,
    EmptyResponseException,
)


@dataclasses.dataclass
class TikTokPlaywrightSession:
    """A TikTok session using Playwright"""

    context: Any
    page: Any
    proxy: str = None
    params: dict = None
    headers: dict = None
    ms_token: str = None
    base_url: str = "https://www.tiktok.com"


class TikTokApi:
    """The main TikTokApi class that contains all the endpoints.

    Import With:
        .. code-block:: python

            from TikTokApi import TikTokApi
            api = TikTokApi()
    """

    user = User
    video = Video
    sound = Sound
    hashtag = Hashtag
    comment = Comment
    trending = Trending
    search = Search
    playlist = Playlist

    def __init__(self, logging_level: int = logging.WARN, logger_name: str = None):
        """
        Create a TikTokApi object.

        Args:
            logging_level (int): The logging level you want to use.
            logger_name (str): The name of the logger you want to use.
        """
        self.sessions = []

        if logger_name is None:
            logger_name = __name__
        self.__create_logger(logger_name, logging_level)

        User.parent = self
        Video.parent = self
        Sound.parent = self
        Hashtag.parent = self
        Comment.parent = self
        Trending.parent = self
        Search.parent = self
        Playlist.parent = self

    def __create_logger(self, name: str, level: int = logging.DEBUG):
        """Create a logger for the class."""
        self.logger: logging.Logger = logging.getLogger(name)
        self.logger.setLevel(level)
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)

    async def __set_session_params(self, session: TikTokPlaywrightSession):
        user_agent = await session.page.evaluate("() => navigator.userAgent")
        language = await session.page.evaluate("() => navigator.language || navigator.userLanguage")
        platform = await session.page.evaluate("() => navigator.platform")
        timezone = await session.page.evaluate("() => Intl.DateTimeFormat().resolvedOptions().timeZone")

        session.params = {
            "aid": "1988",
            "app_language": language,
            "app_name": "tiktok_web",
            "browser_language": language,
            "browser_name": "Mozilla",
            "browser_online": "true",
            "browser_platform": platform,
            "browser_version": user_agent,
            "channel": "tiktok_web",
            "cookie_enabled": "true",
            "device_platform": "web_pc",
            "focus_state": "true",
            "from_page": "video",
            "history_len": "4",
            "is_fullscreen": "false",
            "is_page_visible": "true",
            "priority_region": "VN",
            "referer": "",
            "region": "VN",
            "screen_height": "1080",
            "screen_width": "1920",
            "tz_name": timezone or "Asia/Bangkok",
            "webcast_language": language,
        }

    async def __create_session(
        self, url: str = "https://www.tiktok.com", ms_token: str = None, proxy: str = None,
        context_options: dict = {}, sleep_after: int = 1, cookies: dict = None,
        suppress_resource_load_types: list[str] = None, timeout: int = 30000,
    ):
        if ms_token is not None:
            if cookies is None:
                cookies = {}
            cookies["msToken"] = ms_token

        context = await self.browser.new_context(proxy=proxy, ignore_https_errors=True, **context_options)
        if cookies:
            formatted = [{"name": k, "value": v, "domain": urlparse(url).netloc, "path": "/"} for k, v in cookies.items() if v]
            await context.add_cookies(formatted)

        page = await context.new_page()
        await stealth_async(page)

        request_headers = None
        def handle_request(req):
            nonlocal request_headers
            request_headers = req.headers
        page.once("request", handle_request)

        if suppress_resource_load_types:
            await page.route("**/*", lambda route, req: route.abort()
                             if req.resource_type in suppress_resource_load_types else route.continue_())

        page.set_default_navigation_timeout(timeout)
        await page.goto(url)
        await page.goto(url)  # warm-up

        await page.mouse.move(20, 20)
        await page.wait_for_load_state("networkidle")

        session = TikTokPlaywrightSession(context, page, ms_token=ms_token, proxy=proxy, headers=request_headers, base_url=url)
        if ms_token is None:
            await asyncio.sleep(sleep_after)
            jar = await self.get_session_cookies(session)
            session.ms_token = jar.get("msToken")
        self.sessions.append(session)
        await self.__set_session_params(session)

    async def create_sessions(self, num_sessions=1, headless=True, ms_tokens: list[str] = None,
                              proxies: list = None, sleep_after=1, starting_url="https://www.tiktok.com",
                              context_options: dict = {}, override_browser_args: list[dict] = None,
                              cookies: list[dict] = None, suppress_resource_load_types: list[str] = None,
                              browser: str = "chromium", executable_path: str = None, timeout: int = 30000):
        self.playwright = await async_playwright().start()
        if browser == "chromium":
            if headless and override_browser_args is None:
                override_browser_args = ["--headless=new"]
                headless = False
            self.browser = await self.playwright.chromium.launch(
                headless=headless, args=override_browser_args, proxy=random_choice(proxies), executable_path=executable_path
            )
        elif browser == "firefox":
            self.browser = await self.playwright.firefox.launch(
                headless=headless, args=override_browser_args, proxy=random_choice(proxies), executable_path=executable_path
            )
        elif browser == "webkit":
            self.browser = await self.playwright.webkit.launch(
                headless=headless, args=override_browser_args, proxy=random_choice(proxies), executable_path=executable_path
            )
        else:
            raise ValueError("Invalid browser")

        await asyncio.gather(*(
            self.__create_session(
                proxy=random_choice(proxies), ms_token=random_choice(ms_tokens),
                url=starting_url, context_options=context_options,
                sleep_after=sleep_after, cookies=random_choice(cookies),
                suppress_resource_load_types=suppress_resource_load_types, timeout=timeout
            ) for _ in range(num_sessions)
        ))

    def generate_js_fetch(self, method: str, url: str, headers: dict) -> str:
        """Generate a javascript fetch function for use in playwright"""
        headers_js = json.dumps(headers)
        return f"""
            () => {{
                return new Promise((resolve, reject) => {{
                    fetch('{url}', {{ method: '{method}', headers: {headers_js} }})
                        .then(response => response.text())
                        .then(data => resolve(data))
                        .catch(error => reject(error.message));
                }});
            }}
        """

    def _get_session(self, **kwargs):
        if not self.sessions:
            raise Exception("No sessions created")
        idx = kwargs.get("session_index")
        if idx is None:
            idx = random.randint(0, len(self.sessions) - 1)
        return idx, self.sessions[idx]

    async def set_session_cookies(self, session, cookies):
        await session.context.add_cookies(cookies)

    async def get_session_cookies(self, session):
        cookies = await session.context.cookies()
        return {c["name"]: c["value"] for c in cookies}

    async def run_fetch_script(self, url: str, headers: dict, **kwargs):
        js_script = self.generate_js_fetch("GET", url, headers)
        _, session = self._get_session(**kwargs)
        result = await session.page.evaluate(js_script)
        return result
    
    async def generate_x_bogus(self, url: str, **kwargs):
        _, session = self._get_session(**kwargs)
        for _ in range(5):
            try:
                await session.page.wait_for_function("window.byted_acrawler !== undefined", timeout=random.randint(5000, 20000))
                break
            except TimeoutError:
                await session.page.goto(random.choice([
                    "https://www.tiktok.com/foryou", "https://www.tiktok.com",
                    "https://www.tiktok.com/@tiktok", "https://www.tiktok.com/foryou"
                ]))
        return await session.page.evaluate(
            f'() => window.byted_acrawler.frontierSign("{url}")'
        )

    async def sign_url(self, url: str, **kwargs):
        x = (await self.generate_x_bogus(url, **kwargs)).get("X-Bogus")
        if not x:
            raise Exception("Failed to generate X-Bogus")
        return f"{url}{'&' if '?' in url else '?'}X-Bogus={x}"

    async def is_logged_in(self, **kwargs) -> bool:
        _, session = self._get_session(**kwargs)
        cookies = await self.get_session_cookies(session)
        return bool(cookies.get("sessionid") or cookies.get("sid_guard")) and bool(cookies.get("tt_csrf_token") or cookies.get("tt-csrf-token"))
    
    async def ensure_login(self, **kwargs):
        i, session = self._get_session(**kwargs)
        if await self.is_logged_in(session_index=i):
            return
        await session.page.goto("https://www.tiktok.com/login")
        for _ in range(120):
            await asyncio.sleep(1)
            if await self.is_logged_in(session_index=i):
                await session.page.goto("https://www.tiktok.com/", wait_until="domcontentloaded")
                return
        raise Exception("Login timeout")

    async def make_request(
        self,
        url: str,
        headers: dict = None,
        params: dict = None,
        retries: int = 3,
        exponential_backoff: bool = True,
        **kwargs,
    ):
        """
        Makes a request to TikTok through a session.

        Args:
            url (str): The url to make the request to.
            headers (dict): The headers to use for the request.
            params (dict): The params to use for the request.
            retries (int): The amount of times to retry the request if it fails.
            exponential_backoff (bool): Whether or not to use exponential backoff when retrying the request.
            session_index (int): The index of the session you want to use, if not provided a random session will be used.

        Returns:
            dict: The json response from TikTok.

        Raises:
            Exception: If the request fails.
        """
        i, session = self._get_session(**kwargs)
        if session.params is not None:
            params = {**session.params, **params}

        if headers is not None:
            headers = {**session.headers, **headers}
        else:
            headers = session.headers

        # get msToken
        if params.get("msToken") is None:
            # try to get msToken from session
            if session.ms_token is not None:
                params["msToken"] = session.ms_token
            else:
                # we'll try to read it from cookies
                cookies = await self.get_session_cookies(session)
                ms_token = cookies.get("msToken")
                if ms_token is None:
                    self.logger.warn(
                        "Failed to get msToken from cookies, trying to make the request anyway (probably will fail)"
                    )
                params["msToken"] = ms_token

        encoded_params = f"{url}?{urlencode(params, safe='=', quote_via=quote)}"
        signed_url = await self.sign_url(encoded_params, session_index=i)

        retry_count = 0
        while retry_count < retries:
            retry_count += 1
            result = await self.run_fetch_script(
                signed_url, headers=headers, session_index=i
            )

            if result is None:
                raise Exception("TikTokApi.run_fetch_script returned None")

            if result == "":
                raise EmptyResponseException(result, "TikTok returned an empty response. They are detecting you're a bot, try some of these: headless=False, browser='webkit', consider using a proxy")

            try:
                data = json.loads(result)
                if data.get("status_code") != 0:
                    self.logger.error(f"Got an unexpected status code: {data}")
                return data
            except json.decoder.JSONDecodeError:
                if retry_count == retries:
                    self.logger.error(f"Failed to decode json response: {result}")
                    raise InvalidJSONException()

                self.logger.info(
                    f"Failed a request, retrying ({retry_count}/{retries})"
                )
                if exponential_backoff:
                    await asyncio.sleep(2**retry_count)
                else:
                    await asyncio.sleep(1)

    async def run_post_script(self, url: str, headers: dict, body: dict,
                          referrer: str = "https://www.tiktok.com/", **kwargs):
        """
        Gửi POST trực tiếp trong *main world* của trang.
        Ưu tiên dùng window.TTKRequest.fetch (có đủ anti-bot signals), fallback window.fetch.
        KHÔNG tự ép headers để tránh bị TicketGuard.
        """
        js_code = """
            (args) => new Promise((resolve) => {
                const { targetUrl, bodyMap } = args;

                // Build form only if bodyMap provided
                let form = null;
                if (bodyMap && Object.keys(bodyMap).length) {
                    form = new URLSearchParams();
                    for (const [k, v] of Object.entries(bodyMap)) {
                        form.append(k, v == null ? '' : String(v));
                    }
                }

                const doFetch = (window.TTKRequest && typeof window.TTKRequest.fetch === 'function')
                        ? window.TTKRequest.fetch.bind(window.TTKRequest)
                        : window.fetch.bind(window);

                // tuyệt đối không set headers thủ công ở đây
                // để browser/TTKRequest tự gắn content-type, CSRF, trace headers...
                doFetch(targetUrl, {
                    method: 'POST',
                    ...(form ? { body: form } : {}),
                    credentials: 'include',
                    // để mặc định/referrer hiện hành; không ép mode để tránh sai policy
                })
                .then(async (res) => {
                    const text = await res.text();
                    resolve({
                        ok: res.ok,
                        status: res.status,
                        statusText: res.statusText,
                        url: res.url,
                        text
                    });
                })
                .catch((e) => resolve({ ok: false, status: 0, statusText: String(e), url: targetUrl, text: '' }));
            })
        """
        i, session = self._get_session(**kwargs)
        page = session.page

        if referrer and referrer.startswith("https://www.tiktok.com/"):
            try:
                await page.goto(referrer, wait_until="domcontentloaded")
                await page.mouse.move(18, 18)
                await page.wait_for_timeout(250)
            except Exception:
                pass

        args = {"targetUrl": url, "bodyMap": body}
        handle = await page.evaluate_handle(js_code, args)
        return await handle.json_value()

    async def make_request_post(
        self,
        url: str,
        data: dict = None,
        params: dict = None,
        headers: dict = None,
        retries: int = 3,
        referrer: str | None = None,
        use_inpage_sign=True,
        **kwargs,
    ):
        i, session = self._get_session(**kwargs)
        if session.params is not None:
            params = {**session.params, **params}

        if headers is not None:
            # có thể ép một vài header tối thiểu bên ngoài nếu thật sự cần
            pass

        # 3) msToken: chỉ tự thêm khi không dùng inpage_fetch
        if not use_inpage_sign:
            ms_token = params.get("msToken")
            if not ms_token:
                cookies = await self.get_session_cookies(session)
                ms_token = cookies.get("msToken")
                if not ms_token:
                    self.logger.warning(
                        "Failed to get msToken from cookies; trying POST anyway (may fail)"
                    )
                params["msToken"] = ms_token

        # 4) Ký URL (X-Bogus)
        if use_inpage_sign:
            params.pop("msToken", None)
            target_url = f"{url}?{urlencode(params, safe='=', quote_via=quote)}"
        else:
            if not params.get("msToken"):
                cookies = await self.get_session_cookies(session)
                if cookies.get("msToken"):
                    params["msToken"] = cookies["msToken"]
            base = f"{url}?{urlencode(params, safe='=', quote_via=quote)}"
            target_url = await self.sign_url(base, session_index=i)

        # 5) Gọi POST trong main world
        max_attempts = max(1, retries)
        last_result = None
        for attempt in range(max_attempts):
            inpage_result = await self.run_post_script(
                target_url,
                headers=headers,
                body=data,
                referrer=referrer,
                session_index=i,
            )
            last_result = inpage_result

            try:
                print("🪶 INPAGE POST:", inpage_result.get("status"), inpage_result.get("statusText"))
            except Exception:
                pass

            if inpage_result and inpage_result.get("ok"):
                body_text = (inpage_result.get("text") or "").strip()
                if body_text:
                    try:
                        return json.loads(body_text)
                    except json.decoder.JSONDecodeError:
                        return {"ok": True, "raw": inpage_result, "message": "Non-JSON response body."}
                else:
                    # OK nhưng body rỗng (ví dụ 204)
                    return {"ok": True, "raw": inpage_result, "message": "Empty response body."}

            # Retry: backoff nhẹ
            await asyncio.sleep(1 + attempt)

        # Hết retries, vẫn fail
        return {"ok": False, "raw": last_result, "message": "Request failed or blocked."}

    async def get_session_content(self, url: str, **kwargs):
        """Get the content of a url"""
        _, session = self._get_session(**kwargs)
        return await session.page.content()

    async def close_sessions(self):
        for session in self.sessions:
            await session.page.close()
            await session.context.close()
        self.sessions.clear()

    async def stop_playwright(self):
        await self.browser.close()
        await self.playwright.stop()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close_sessions()
        await self.stop_playwright()
