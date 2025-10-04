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
        """Set the session params for a TikTokPlaywrightSession"""
        user_agent = await session.page.evaluate("() => navigator.userAgent")
        language = await session.page.evaluate(
            "() => navigator.language || navigator.userLanguage"
        )
        platform = await session.page.evaluate("() => navigator.platform")
        device_id = str(random.randint(10**18, 10**19 - 1))  # Random device id
        history_len = str(random.randint(1, 10))  # Random history length
        screen_height = str(random.randint(600, 1080))  # Random screen height
        screen_width = str(random.randint(800, 1920))  # Random screen width
        timezone = await session.page.evaluate(
            "() => Intl.DateTimeFormat().resolvedOptions().timeZone"
        )

        session_params = {
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
            "device_id": device_id,
            "device_platform": "web_pc",
            "focus_state": "true",
            "from_page": "user",
            "history_len": history_len,
            "is_fullscreen": "false",
            "is_page_visible": "true",
            "language": language,
            "os": platform,
            "priority_region": "VN",
            "referer": "",
            "region": "VN",  # TODO: TikTokAPI option
            "screen_height": screen_height,
            "screen_width": screen_width,
            "tz_name": timezone,
            "webcast_language": language,
        }
        session.params = session_params

    async def __create_session(
        self,
        url: str = "https://www.tiktok.com",
        ms_token: str = None,
        proxy: str = None,
        context_options: dict = {},
        sleep_after: int = 1,
        cookies: dict = None,
        suppress_resource_load_types: list[str] = None,
        timeout: int = 30000,
    ):
        try:
            """Create a TikTokPlaywrightSession"""
            if ms_token is not None:
                if cookies is None:
                    cookies = {}
                cookies["msToken"] = ms_token
    
            context = await self.browser.new_context(proxy=proxy, ignore_https_errors=True, **context_options)
            if cookies is not None:
                formatted_cookies = [
                    {"name": k, "value": v, "domain": urlparse(url).netloc, "path": "/"}
                    for k, v in cookies.items()
                    if v is not None
                ]
                await context.add_cookies(formatted_cookies)
            page = await context.new_page()
            await stealth_async(page)
    
            # Get the request headers to the url
            request_headers = None
    
            def handle_request(request):
                nonlocal request_headers
                request_headers = request.headers
    
            page.once("request", handle_request)
    
            if suppress_resource_load_types is not None:
                await page.route(
                    "**/*",
                    lambda route, request: route.abort()
                    if request.resource_type in suppress_resource_load_types
                    else route.continue_(),
                )
            
            # Set the navigation timeout
            page.set_default_navigation_timeout(timeout)
    
            await page.goto(url)
            await page.goto(url) # hack: tiktok blocks first request not sure why, likely bot detection
            
            # by doing this, we are simulate scroll event using mouse to `avoid` bot detection
            x, y = random.randint(0, 50), random.randint(0, 50)
            a, b = random.randint(1, 50), random.randint(100, 200)
    
            await page.mouse.move(x, y)
            await page.wait_for_load_state("networkidle")
            await page.mouse.move(a, b)
    
            session = TikTokPlaywrightSession(
                context,
                page,
                ms_token=ms_token,
                proxy=proxy,
                headers=request_headers,
                base_url=url,
            )

            if ms_token is None:
                await asyncio.sleep(sleep_after)  # TODO: Find a better way to wait for msToken
                cookies = await self.get_session_cookies(session)
                ms_token = cookies.get("msToken")
                session.ms_token = ms_token
                if ms_token is None:
                    self.logger.info(
                        f"Failed to get msToken on session index {len(self.sessions)}, you should consider specifying ms_tokens"
                    )
            self.sessions.append(session)
            await self.__set_session_params(session)
        except Exception as e:
            # clean up
            self.logger.error(f"Failed to create session: {e}")
            # Cleanup resources if they were partially created
            if 'page' in locals():
                await page.close()
            if 'context' in locals():
                await context.close()
            raise  # Re-raise the exception after cleanup

    async def create_sessions(
        self,
        num_sessions=5,
        headless=True,
        ms_tokens: list[str] = None,
        proxies: list = None,
        sleep_after=1,
        starting_url="https://www.tiktok.com",
        context_options: dict = {},
        override_browser_args: list[dict] = None,
        cookies: list[dict] = None,
        suppress_resource_load_types: list[str] = None,
        browser: str = "chromium",
        executable_path: str = None,
        timeout: int = 30000,
    ):
        """
        Create sessions for use within the TikTokApi class.

        These sessions are what will carry out requesting your data from TikTok.

        Args:
            num_sessions (int): The amount of sessions you want to create.
            headless (bool): Whether or not you want the browser to be headless.
            ms_tokens (list[str]): A list of msTokens to use for the sessions, you can get these from your cookies after visiting TikTok.
                                   If you don't provide any, the sessions will try to get them themselves, but this is not guaranteed to work.
            proxies (list): A list of proxies to use for the sessions
            sleep_after (int): The amount of time to sleep after creating a session, this is to allow the msToken to be generated.
            starting_url (str): The url to start the sessions on, this is usually https://www.tiktok.com.
            context_options (dict): Options to pass to the playwright context.
            override_browser_args (list[dict]): A list of dictionaries containing arguments to pass to the browser.
            cookies (list[dict]): A list of cookies to use for the sessions, you can get these from your cookies after visiting TikTok.
            suppress_resource_load_types (list[str]): Types of resources to suppress playwright from loading, excluding more types will make playwright faster.. Types: document, stylesheet, image, media, font, script, textrack, xhr, fetch, eventsource, websocket, manifest, other.
            browser (str): firefox, chromium, or webkit; default is chromium
            executable_path (str): Path to the browser executable
            timeout (int): The timeout in milliseconds for page navigation

        Example Usage:
            .. code-block:: python

                from TikTokApi import TikTokApi
                with TikTokApi() as api:
                    await api.create_sessions(num_sessions=5, ms_tokens=['msToken1', 'msToken2'])
        """
        self.playwright = await async_playwright().start()
        if browser == "chromium":
            if headless and override_browser_args is None:
                override_browser_args = ["--headless=new"]
                headless = False  # managed by the arg
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
            raise ValueError("Invalid browser argument passed")

        await asyncio.gather(
            *(
                self.__create_session(
                    proxy=random_choice(proxies),
                    ms_token=random_choice(ms_tokens),
                    url=starting_url,
                    context_options=context_options,
                    sleep_after=sleep_after,
                    cookies=random_choice(cookies),
                    suppress_resource_load_types=suppress_resource_load_types,
                    timeout=timeout,
                )
                for _ in range(num_sessions)
            )
        )

    async def close_sessions(self):
        """
        Close all the sessions. Should be called when you're done with the TikTokApi object

        This is called automatically when using the TikTokApi with "with"
        """
        for session in self.sessions:
            await session.page.close()
            await session.context.close()
        self.sessions.clear()

        await self.browser.close()
        await self.playwright.stop()

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
        """Get a random session

        Args:
            session_index (int): The index of the session you want to use, if not provided a random session will be used.

        Returns:
            int: The index of the session.
            TikTokPlaywrightSession: The session.
        """
        if len(self.sessions) == 0:
            raise Exception("No sessions created, please create sessions first")

        if kwargs.get("session_index") is not None:
            i = kwargs["session_index"]
        else:
            i = random.randint(0, len(self.sessions) - 1)
        return i, self.sessions[i]

    async def set_session_cookies(self, session, cookies):
        """
        Set the cookies for a session

        Args:
            session (TikTokPlaywrightSession): The session to set the cookies for.
            cookies (dict): The cookies to set for the session.
        """
        await session.context.add_cookies(cookies)

    async def get_session_cookies(self, session):
        """
        Get the cookies for a session

        Args:
            session (TikTokPlaywrightSession): The session to get the cookies for.

        Returns:
            dict: The cookies for the session.
        """
        cookies = await session.context.cookies()
        return {cookie["name"]: cookie["value"] for cookie in cookies}

    async def run_fetch_script(self, url: str, headers: dict, **kwargs):
        """
        Execute a javascript fetch function in a session

        Args:
            url (str): The url to fetch.
            headers (dict): The headers to use for the fetch.

        Returns:
            any: The result of the fetch. Seems to be a string or dict
        """
        js_script = self.generate_js_fetch("GET", url, headers)
        _, session = self._get_session(**kwargs)
        result = await session.page.evaluate(js_script)
        return result
    
    async def generate_x_bogus(self, url: str, **kwargs):
        """Generate the X-Bogus header for a url"""
        _, session = self._get_session(**kwargs)

        max_attempts = 5
        attempts = 0
        while attempts < max_attempts:
            attempts += 1
            try:
                timeout_time = random.randint(5000, 20000)
                await session.page.wait_for_function("window.byted_acrawler !== undefined", timeout=timeout_time)
                break
            except TimeoutError as e:
                if attempts == max_attempts:
                    raise TimeoutError(f"Failed to load tiktok after {max_attempts} attempts, consider using a proxy")
                
                try_urls = ["https://www.tiktok.com/foryou", "https://www.tiktok.com", "https://www.tiktok.com/@tiktok", "https://www.tiktok.com/foryou"]

                await session.page.goto(random.choice(try_urls))
        
        result = await session.page.evaluate(
            f'() => {{ return window.byted_acrawler.frontierSign("{url}") }}'
        )
        return result

    async def sign_url(self, url: str, **kwargs):
        """Sign a url"""
        i, session = self._get_session(**kwargs)

        # TODO: Would be nice to generate msToken here

        # Add X-Bogus to url
        x_bogus = (await self.generate_x_bogus(url, session_index=i)).get("X-Bogus")
        if x_bogus is None:
            raise Exception("Failed to generate X-Bogus")

        if "?" in url:
            url += "&"
        else:
            url += "?"
        url += f"X-Bogus={x_bogus}"

        return url

    async def is_logged_in(self, **kwargs) -> bool:
        _, session = self._get_session(**kwargs)
        cookies = await self.get_session_cookies(session)
        # TikTok yêu cầu có phiên đăng nhập thực sự
        has_session = bool(cookies.get("sessionid") or cookies.get("sid_guard"))
        has_csrf    = bool(cookies.get("tt_csrf_token") or cookies.get("tt-csrf-token"))
        return has_session and has_csrf
    
    async def ensure_login(self, **kwargs):
        i, session = self._get_session(**kwargs)
        if await self.is_logged_in(session_index=i):
            return
        await session.page.goto("https://www.tiktok.com/login")
        for _ in range(120):
            await asyncio.sleep(1)
            if await self.is_logged_in(session_index=i):
                # 👉 quay về trang chủ để “thoát” khỏi login app
                await session.page.goto("https://www.tiktok.com/", wait_until="domcontentloaded")
                return
        raise Exception("Login timeout: please log in to TikTok in the opened browser.")

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

                // form-urlencoded body
                const form = new URLSearchParams();
                for (const [k, v] of Object.entries(bodyMap || {})) {
                    form.append(k, v == null ? '' : String(v));
                }

                // chọn fetch gốc của TikTok nếu có
                const doFetch =
                    (window.TTKRequest && typeof window.TTKRequest.fetch === 'function')
                        ? window.TTKRequest.fetch.bind(window.TTKRequest)
                        : window.fetch.bind(window);

                // tuyệt đối không set headers thủ công ở đây
                // để browser/TTKRequest tự gắn content-type, CSRF, trace headers...
                doFetch(targetUrl, {
                    method: 'POST',
                    body: form,
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
                .catch(e => resolve({
                    ok: false,
                    status: 0,
                    statusText: String(e),
                    url: targetUrl,
                    text: ''
                }));
            })
        """

        i, session = self._get_session(**kwargs)
        page = session.page

        # Vào đúng trang video (để Referer + origin đúng, context đầy đủ)
        if referrer and referrer.startswith("https://www.tiktok.com/"):
            try:
                print("🪶 REFERRER:", referrer)
                await page.goto(referrer, wait_until="domcontentloaded")
                await page.mouse.move(20, 20)
                await page.wait_for_timeout(300)
            except Exception as e:
                print("⚠️ REFERRER GOTO FAIL:", e)

        args = { "targetUrl": url, "bodyMap": body or {} }
        handle = await page.evaluate_handle(js_code, args)
        return await handle.json_value()


    async def make_request_post(
        self,
        url: str,
        data: dict = None,
        headers: dict = None,
        retries: int = 3,
        exponential_backoff: bool = True,
        referrer: str | None = None,
        **kwargs,
    ):
        """
        POST tới TikTok ưu tiên qua page-context (tránh TicketGuard 1101), rồi mới fallback RequestContext.
        - Bổ sung đầy đủ CSRF headers (x-tt-csrftoken, x-secsdk-*).
        - Đưa verifyFp (từ cookie s_v_web_id) vào query để ký X-Bogus.
        - Đưa aid=1988 vào body (giống web client).
        - Điều hướng tới referrer (URL video) trước khi ký & post để giữ JS signals.
        """
        i, session = self._get_session(**kwargs)

        # ==== Base headers fallback ====
        if not session.headers:
            session.headers = {"accept-language": "en-US,en;q=0.9"}

        base_headers = (session.headers or {}).copy()
        headers = {**base_headers, **(headers or {})}

        # ==== Chuẩn hóa referrer ====
        referrer_url = referrer or "https://www.tiktok.com/"
        print("🪶 REFERRER:", referrer_url)

        # ==== Lấy UA ====
        try:
            ua = await session.page.evaluate("() => navigator.userAgent")
        except Exception:
            ua = headers.get("user-agent") or headers.get("User-Agent")
        if ua:
            headers["user-agent"] = ua

        # ==== Lấy cookies & CSRF ====
        cookies = await self.get_session_cookies(session)

        tt_csrf = cookies.get("tt_csrf_token") or cookies.get("tt-csrf-token")
        passport_csrf = cookies.get("passport_csrf_token") or cookies.get("passport_csrf_token_default")

        # ==== Query params để ký ====
        params = dict(session.params or {})
        if not params.get("msToken"):
            params["msToken"] = session.ms_token or cookies.get("msToken")

        verify_fp = cookies.get("s_v_web_id")
        if verify_fp:
            params["verifyFp"] = verify_fp

        extra_params = {
            "WebIdLastTime": str(int(time.time() * 1000)),
            "app_name": "tiktok_web",
            "channel": "tiktok_web",
            "cookie_enabled": "true",
            "data_collection_enabled": "true",
            "focus_state": "true",
            "from_page": "video",
            "is_fullscreen": "false",
            "is_page_visible": "true",
            "user_is_login": "true",
            "webcast_language": params.get("app_language") or params.get("language") or "vi",
        }
        for k in ("screen_height", "screen_width", "tz_name"):
            if k not in params and k in (session.params or {}):
                extra_params[k] = session.params[k]
        params.update(extra_params)

        encoded_url = f"{url}?{urlencode(params, doseq=True)}"
        if " " in encoded_url:
            encoded_url = encoded_url.replace(" ", "%20")

        # ==== Điều hướng tới referrer trước khi ký ====
        signed_url = encoded_url
        try:
            if referrer_url.startswith("https://www.tiktok.com/"):
                await session.page.goto(referrer_url, wait_until="domcontentloaded")
                await session.page.mouse.move(24, 48)
                await session.page.wait_for_timeout(300)
        except Exception as e:
            self.logger.warning(f"Referrer goto failed: {e}")

        # ==== Ký X-Bogus ====
        try:
            signed_url = await self.sign_url(encoded_url, session_index=i)
        except Exception as e:
            self.logger.warning(f"Sign URL failed: {e}")

        # ==== Build body ====
        post_body = dict(data or {})
        post_body.setdefault("aid", "1988")

        # ❗ In-page: đừng ép headers – để TikTok tự gắn (TTKRequest/fetch)
        inpage_headers = {}  # cố tình để trống

        max_attempts = max(1, retries)
        for attempt in range(max_attempts):
            inpage_result = await self.run_post_script(
                signed_url, headers=inpage_headers, body=post_body, referrer=referrer_url
            )
            try:
                print("🪶 INPAGE POST:", inpage_result.get("status"), inpage_result.get("statusText"))
            except Exception:
                pass

            if inpage_result and inpage_result.get("ok") and (inpage_result.get("text") or "").strip():
                try:
                    return json.loads(inpage_result["text"])
                except json.decoder.JSONDecodeError:
                    break  # rơi xuống fallback

            # nếu body vẫn rỗng (thường 1101), reload + re-sign thử tiếp
            if attempt < max_attempts - 1:
                try:
                    await session.page.reload(wait_until="domcontentloaded")
                    await session.page.mouse.move(30, 30)
                    await session.page.wait_for_timeout(450)
                    signed_url = await self.sign_url(encoded_url, session_index=i)
                except Exception as e:
                    self.logger.warning(f"Retry failed: {e}")
                    break

        # --- Fallback: RequestContext (giữ nguyên như bạn đang có) ---
        status, text = await self._post_via_request_context(session, signed_url, post_body, headers)
        print("🪶 DEBUG RESPONSE:", status, text[:500])
        if not (text or "").strip():
            raise EmptyResponseException(text, f"TikTok returned empty response (HTTP {status}).")
        return json.loads(text)

    async def _post_via_request_context(self, session, url, data, headers):
        headers.update({
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9,vi;q=0.8",
            "sec-ch-ua": '"Chromium";v="117", "Not)A;Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        })

        request = session.context.request
        # data là dict -> Playwright sẽ gửi form-urlencoded đúng content-type phía trên
        res = await request.post(url, headers=headers, data=data)
        text = await res.text()
        print("🪶 DEBUG STATUS:", res.status)
        print("🪶 DEBUG HEADERS:", res.headers)
        print("🪶 DEBUG URL:", res.url)
        print("🪶 DEBUG BODY SNIPPET:", text[:500])
        return res.status, text

    async def close_sessions(self):
        """Close all the sessions. Should be called when you're done with the TikTokApi object"""
        for session in self.sessions:
            await session.page.close()
            await session.context.close()
        self.sessions.clear()

    async def stop_playwright(self):
        """Stop the playwright browser"""
        await self.browser.close()
        await self.playwright.stop()

    async def get_session_content(self, url: str, **kwargs):
        """Get the content of a url"""
        _, session = self._get_session(**kwargs)
        return await session.page.content()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close_sessions()
        await self.stop_playwright()
