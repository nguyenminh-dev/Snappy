from __future__ import annotations
from ..helpers import extract_video_id_from_url, requests_cookie_to_playwright_cookie
from typing import TYPE_CHECKING, ClassVar, AsyncIterator, Optional, Union
from datetime import datetime
import requests
from ..exceptions import InvalidResponseException
import json
import httpx
import asyncio
import time
import os

if TYPE_CHECKING:
    from ..tiktok import TikTokApi
    from .user import User
    from .sound import Sound
    from .hashtag import Hashtag
    from .comment import Comment


class Video:
    """
    A TikTok Video class

    Example Usage
    ```py
    video = api.video(id='7041997751718137094')
    ```
    """

    parent: ClassVar[TikTokApi]

    id: Optional[str]
    """TikTok's ID of the Video"""
    url: Optional[str]
    """The URL of the Video"""
    create_time: Optional[datetime]
    """The creation time of the Video"""
    stats: Optional[dict]
    """TikTok's stats of the Video"""
    author: Optional[User]
    """The User who created the Video"""
    sound: Optional[Sound]
    """The Sound that is associated with the Video"""
    hashtags: Optional[list[Hashtag]]
    """A List of Hashtags on the Video"""
    as_dict: dict
    """The raw data associated with this Video."""

    def __init__(
        self,
        id: Optional[str] = None,
        url: Optional[str] = None,
        data: Optional[dict] = None,
        **kwargs,
    ):
        """
        You must provide the id or a valid url, else this will fail.
        """
        self.id = id
        self.url = url
        if data is not None:
            self.as_dict = data
            self.__extract_from_data()
        elif url is not None:
            # resolve session briefly to extract video id using headers/proxy if needed
            i, session = self.parent._get_session(**kwargs)
            self.id = extract_video_id_from_url(
                url,
                headers=session.headers,
                proxy=kwargs.get("proxy")
                if kwargs.get("proxy") is not None
                else session.proxy,
            )

        if getattr(self, "id", None) is None:
            raise TypeError("You must provide id or url parameter.")

    async def info(self, **kwargs) -> dict:
        """
        Returns a dictionary of all data associated with a TikTok Video.
        """
        i, session = self.parent._get_session(**kwargs)
        proxy = (
            kwargs.get("proxy") if kwargs.get("proxy") is not None else session.proxy
        )
        if self.url is None:
            raise TypeError("To call video.info() you need to set the video's url.")

        r = requests.get(self.url, headers=session.headers, proxies=proxy)
        if r.status_code != 200:
            raise InvalidResponseException(
                r.text, "TikTok returned an invalid response.", error_code=r.status_code
            )

        # Try SIGI_STATE first
        start = r.text.find('<script id="SIGI_STATE" type="application/json">')
        if start != -1:
            start += len('<script id="SIGI_STATE" type="application/json">')
            end = r.text.find("</script>", start)

            if end == -1:
                raise InvalidResponseException(
                    r.text, "TikTok returned an invalid response.", error_code=r.status_code
                )

            data = json.loads(r.text[start:end])
            video_info = data["ItemModule"][self.id]
        else:
            # Try __UNIVERSAL_DATA_FOR_REHYDRATION__ next
            start = r.text.find('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">')
            if start == -1:
                raise InvalidResponseException(
                    r.text, "TikTok returned an invalid response.", error_code=r.status_code
                )

            start += len('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">')
            end = r.text.find("</script>", start)

            if end == -1:
                raise InvalidResponseException(
                    r.text, "TikTok returned an invalid response.", error_code=r.status_code
                )

            data = json.loads(r.text[start:end])
            default_scope = data.get("__DEFAULT_SCOPE__", {})
            video_detail = default_scope.get("webapp.video-detail", {})
            if video_detail.get("statusCode", 0) != 0: # assume 0 if not present
                raise InvalidResponseException(
                    r.text, "TikTok returned an invalid response structure.", error_code=r.status_code
                )
            video_info = video_detail.get("itemInfo", {}).get("itemStruct")
            if video_info is None:
                raise InvalidResponseException(
                    r.text, "TikTok returned an invalid response structure.", error_code=r.status_code
                )

        self.as_dict = video_info
        self.__extract_from_data()

        cookies = [requests_cookie_to_playwright_cookie(c) for c in r.cookies]

        await self.parent.set_session_cookies(
            session,
            cookies
        )
        return video_info

    async def bytes(self, stream: bool = False, **kwargs) -> Union[bytes, AsyncIterator[bytes]]:
        """
        Returns the bytes of a TikTok Video.
        """
        i, session = self.parent._get_session(**kwargs)
        downloadAddr = self.as_dict["video"]["downloadAddr"]

        cookies = await self.parent.get_session_cookies(session)

        h = session.headers
        h["range"] = 'bytes=0-'
        h["accept-encoding"] = 'identity;q=1, *;q=0'
        h["referer"] = 'https://www.tiktok.com/'

        if stream:
            async def stream_bytes():
                async with httpx.AsyncClient() as client:
                    async with client.stream('GET', downloadAddr, headers=h, cookies=cookies) as response:
                        async for chunk in response.aiter_bytes():
                            yield chunk
            return stream_bytes()
        else:
            resp = requests.get(downloadAddr, headers=h, cookies=cookies)
            return resp.content

    def __extract_from_data(self) -> None:
        data = self.as_dict
        self.id = data["id"]

        timestamp = data.get("createTime", None)
        if timestamp is not None:
            try:
                timestamp = int(timestamp)
            except ValueError:
                pass

        self.create_time = datetime.fromtimestamp(timestamp)
        self.stats = data.get('statsV2') or data.get('stats')

        author = data.get("author")
        if isinstance(author, str):
            self.author = self.parent.user(username=author)
        else:
            self.author = self.parent.user(data=author)
        self.sound = self.parent.sound(data=data)

        self.hashtags = [
            self.parent.hashtag(data=hashtag) for hashtag in data.get("challenges", [])
        ]

        if getattr(self, "id", None) is None:
            Video.parent.logger.error(
                f"Failed to create Video with data: {data}\nwhich has keys {data.keys()}"
            )

    async def comments(self, count=20, cursor=0, **kwargs) -> AsyncIterator[Comment]:
        """
        Returns the comments of a TikTok Video.
        """
        found = 0
        while found < count:
            params = {
                "aweme_id": self.id,
                "count": 20,
                "cursor": cursor,
            }

            resp = await self.parent.make_request(
                url="https://www.tiktok.com/api/comment/list/",
                params=params,
                headers=kwargs.get("headers"),
                session_index=kwargs.get("session_index"),
            )

            if resp is None:
                raise InvalidResponseException(
                    resp, "TikTok returned an invalid response."
                )

            for video in resp.get("comments", []):
                yield self.parent.comment(data=video)
                found += 1

            if not resp.get("has_more", False):
                return

            cursor = resp.get("cursor")

    async def related_videos(
        self, count: int = 30, cursor: int = 0, **kwargs
    ) -> AsyncIterator[Video]:
        """
        Returns related videos of a TikTok Video.
        """
        found = 0
        while found < count:
            params = {
                "itemID": self.id,
                "count": 16,
            }

            resp = await self.parent.make_request(
                url="https://www.tiktok.com/api/related/item_list/",
                params=params,
                headers=kwargs.get("headers"),
                session_index=kwargs.get("session_index"),
            )

            if resp is None:
                raise InvalidResponseException(
                    resp, "TikTok returned an invalid response."
                )

            for video in resp.get("itemList", []):
                yield self.parent.video(data=video)
                found += 1

    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return f"TikTokApi.video(id='{getattr(self, 'id', None)}')"

    # ------------------ POST COMMENT ------------------
    async def post_comment(self, text: str, session_index: int = 0, timeout: int = 20000,
                           headless_debug: bool = False, wait_for_captcha: bool = True,
                           captcha_wait_timeout: int = 120000) -> dict:
        """
        Post a comment to this video's page by driving the page DOM (Playwright).

        Parameters:
            text: comment text
            session_index: which session to use
            headless_debug: set to True when running headful so you can solve captcha manually
            wait_for_captcha: if True, when a captcha is detected the function will wait for manual solve
            captcha_wait_timeout: ms to wait for captcha to be solved (if waiting)
        """

        # ---------- helper: robust session resolution ----------
        def _resolve_session(parent, idx: int):
            """
            Try multiple strategies to find a session object:
            - parent.get_session(idx) if present
            - parent._get_session() or parent._get_session(idx)
            - parent.sessions list (first or idx)
            - parent.session or parent.current_session
            Returns (index, session) or raises RuntimeError.
            """
            # 1) explicit get_session (preferred)
            if hasattr(parent, "get_session"):
                try:
                    maybe = parent.get_session(idx)
                    if isinstance(maybe, tuple) and len(maybe) >= 2:
                        return maybe[0], maybe[1]
                    return idx, maybe
                except Exception:
                    try:
                        maybe = parent.get_session()
                        if isinstance(maybe, tuple) and len(maybe) >= 2:
                            return maybe[0], maybe[1]
                        return 0, maybe
                    except Exception:
                        pass

            # 2) try _get_session variants
            if hasattr(parent, "_get_session"):
                try:
                    maybe = parent._get_session()
                    if isinstance(maybe, tuple) and len(maybe) >= 2:
                        return maybe[0], maybe[1]
                    return 0, maybe
                except TypeError:
                    try:
                        maybe = parent._get_session(idx)
                        if isinstance(maybe, tuple) and len(maybe) >= 2:
                            return maybe[0], maybe[1]
                        return idx, maybe
                    except Exception:
                        pass
                except Exception:
                    pass

            # 3) try sessions-like attributes
            for attr in ("sessions", "_sessions", "session_list", "sessions_list"):
                if hasattr(parent, attr):
                    sess_list = getattr(parent, attr)
                    if sess_list:
                        first = sess_list[idx] if len(sess_list) > idx else sess_list[0]
                        if isinstance(first, tuple) and len(first) >= 2:
                            return first[0], first[1]
                        return idx, first

            # 4) try single session attributes
            for attr in ("session", "current_session"):
                if hasattr(parent, attr):
                    return idx, getattr(parent, attr)

            raise RuntimeError("Cannot resolve session from API instance. Ensure sessions were created and accessible.")

        # ---------- helper: debug save (awaited) ----------
        async def _save_debug(page, tag: str):
            ts = int(time.time())
            ss_path = f"debug_comment_{tag}_{ts}.png"
            html_path = f"debug_comment_{tag}_{ts}.html"
            try:
                if not page.is_closed():
                    try:
                        await page.wait_for_timeout(400)
                    except Exception:
                        pass
                    try:
                        await page.screenshot(path=ss_path, full_page=True)
                    except Exception:
                        ss_path = None
                    try:
                        html = await page.content()
                        with open(html_path, "w", encoding="utf-8") as fh:
                            fh.write(html)
                    except Exception:
                        html_path = None
            except Exception:
                ss_path = None
                html_path = None
            return ss_path, html_path

        # ---------- helper: captcha detection & handling ----------
        async def _detect_and_handle_captcha(page, wait_for_user: bool, wait_timeout_ms: int):
            CAPTCHA_SELECTORS = [
                'text="Drag the slider to fit the puzzle"',
                'text=Drag the slider',
                'iframe[src*="captcha"]',
                'div[class*="captcha"]',
                'div[role="dialog"] >> text="Drag the slider"',
            ]
            for sel in CAPTCHA_SELECTORS:
                try:
                    # prefer locator.count where supported
                    try:
                        if await page.locator(sel).count() > 0:
                            ss, html = await _save_debug(page, "captcha-detected")
                            return True, {"selector": sel, "screenshot": ss, "html": html}
                    except Exception:
                        try:
                            if await page.is_visible(sel):
                                ss, html = await _save_debug(page, "captcha-detected")
                                return True, {"selector": sel, "screenshot": ss, "html": html}
                        except Exception:
                            continue
                except Exception:
                    continue
            try:
                if await page.locator('text=Drag the slider').count() > 0:
                    ss, html = await _save_debug(page, "captcha-detected")
                    return True, {"selector": "text=Drag the slider", "screenshot": ss, "html": html}
            except Exception:
                pass
            return False, {}

        # ---------- start main flow ----------
        try:
            sess_index, session = _resolve_session(self.parent, session_index)
        except Exception as e:
            return {"ok": False, "message": f"Cannot locate session: {e}", "comment_text": text}

        page = getattr(session, "page", None)
        context = getattr(session, "context", None)
        if page is None and context is not None:
            try:
                page = await context.new_page()
            except Exception as e:
                return {"ok": False, "message": f"Cannot create page from session context: {e}", "comment_text": text}

        if page is None:
            return {"ok": False, "message": "No page or context available in session.", "comment_text": text}

        if not getattr(self, "url", None):
            return {"ok": False, "message": "Video.url not set on Video instance.", "comment_text": text}

        # navigate to video page
        try:
            await page.goto(self.url, timeout=timeout)
            await page.wait_for_load_state("networkidle")
        except Exception as e:
            return {"ok": False, "message": f"Failed to navigate to video url: {e}", "comment_text": text}

        # detect captcha immediately after load
        found, info = await _detect_and_handle_captcha(page, wait_for_user=wait_for_captcha, wait_timeout_ms=captcha_wait_timeout)
        if found:
            if wait_for_captcha:
                if not headless_debug:
                    return {"ok": False, "message": "CAPTCHA detected. Rerun with headless_debug=True (headful) and wait_for_captcha=True to solve manually. Artifacts saved.", "comment_text": text, "screenshot": info.get("screenshot"), "html": info.get("html"), "reason": "captcha-detected"}
                print("CAPTCHA detected. Please solve it in the opened browser window.")
                print("Saved artifacts:", info.get("screenshot"), info.get("html"))
                try:
                    # try waiting for the common text to be detached
                    try:
                        await page.wait_for_selector('text=Drag the slider', state='detached', timeout=captcha_wait_timeout)
                    except Exception:
                        try:
                            await page.wait_for_selector('iframe[src*=\"captcha\"]', state='detached', timeout=captcha_wait_timeout)
                        except Exception:
                            await asyncio.get_event_loop().run_in_executor(None, input, "After solving CAPTCHA in browser, press Enter here to continue...")
                    still, _ = await _detect_and_handle_captcha(page, wait_for_user=False, wait_timeout_ms=0)
                    if still:
                        return {"ok": False, "message": "CAPTCHA still present after waiting. Aborting.", "comment_text": text, "screenshot": info.get("screenshot"), "html": info.get("html"), "reason": "captcha-not-cleared"}
                except Exception as ex:
                    return {"ok": False, "message": f"Error while waiting for CAPTCHA solve: {ex}", "comment_text": text, "screenshot": info.get("screenshot"), "html": info.get("html"), "reason": "captcha-wait-error"}
            else:
                return {"ok": False, "message": "CAPTCHA detected (not waiting). Rerun with wait_for_captcha=True and headless_debug=True to solve manually.", "comment_text": text, "screenshot": info.get("screenshot"), "html": info.get("html"), "reason": "captcha-detected"}

        # quick login-probing (non fatal)
        try:
            logged_indicators = [
                'a[href*="/upload"]', 'button[data-e2e="user-avatar"]',
                'img[alt="Profile photo"]', 'div[data-e2e="user-avatar"]'
            ]
            logged = False
            for sel in logged_indicators:
                try:
                    if await page.query_selector(sel):
                        logged = True
                        break
                except Exception:
                    continue
        except Exception:
            logged = False

        # Try opening comment panel by clicking comment icon if present
        comment_icon_selectors = [
            'button[data-e2e="comment-icon"]',
            'span[data-e2e="comment-icon"]',
            'div[data-e2e="comment-icon"]',
            'button[aria-label*="Comment"]',
            'button[aria-label*="Bình luận"]',
            'svg[aria-label="Comment"]'
        ]
        panel_opened = False
        for sel in comment_icon_selectors:
            try:
                el = await page.query_selector(sel)
                if el:
                    try:
                        await el.scroll_into_view_if_needed()
                        await el.click()
                        await page.wait_for_timeout(700)
                        panel_opened = True
                        break
                    except Exception:
                        continue
            except Exception:
                continue

        # Candidate input selectors (update list if TikTok changes DOM)
        candidate_inputs = [
            'div[contenteditable="true"]',
            'div[role="textbox"]',
            'textarea[placeholder*="Bình luận"]',
            'textarea[placeholder*="Add a comment"]',
            'div.ProseMirror',
            'div.public-DraftStyleDefault-block[contenteditable="true"]'
        ]

        input_sel = None
        for s in candidate_inputs:
            try:
                await page.wait_for_selector(s, timeout=1200)
                input_sel = s
                break
            except Exception:
                continue

        # If not found, try scroll anchors and re-scan
        if input_sel is None:
            anchors = [
                'div[data-e2e="comment-section"]',
                'div[data-e2e="comments"]',
                'div[class*="CommentsList"]'
            ]
            for a in anchors:
                try:
                    anchor = await page.query_selector(a)
                    if anchor:
                        await anchor.scroll_into_view_if_needed()
                        await page.wait_for_timeout(600)
                        for s in candidate_inputs:
                            try:
                                await page.wait_for_selector(s, timeout=1000)
                                input_sel = s
                                break
                            except Exception:
                                continue
                        if input_sel:
                            break
                except Exception:
                    continue

        if input_sel is None:
            ss, html = await _save_debug(page, "input-not-found")
            return {"ok": False, "message": "Comment input not found. Saved debug artifacts.", "comment_text": text, "screenshot": ss, "html": html, "reason": "input-not-found"}

        # Type and submit (unchanged)
        try:
            await page.click(input_sel)
            # clear selection (Ctrl+A + Backspace) best-effort
            try:
                await page.keyboard.down("Control")
                await page.keyboard.press("KeyA")
                await page.keyboard.up("Control")
                await page.keyboard.press("Backspace")
            except Exception:
                pass

            for chunk in [text[i:i+150] for i in range(0, len(text), 150)]:
                await page.keyboard.type(chunk, delay=30)

            await page.keyboard.press("Enter")
            await page.wait_for_timeout(900)

            post_btns = [
                'button[data-e2e="comment-post"]',
                'button:has-text("Post")',
                'button:has-text("Đăng")',
                'button[aria-label*="Post"]'
            ]
            for b in post_btns:
                try:
                    el = await page.query_selector(b)
                    if el:
                        await el.click()
                        await page.wait_for_timeout(700)
                        break
                except Exception:
                    continue

            try:
                found = await page.query_selector(f'text="{text}"')
            except Exception:
                found = None

            if found:
                return {"ok": True, "message": "Comment found in DOM (likely posted).", "comment_text": text}
            else:
                ss, html = await _save_debug(page, "submitted-not-verified")
                return {"ok": True, "message": "Attempted submit but couldn't verify in DOM. Saved artifacts.", "comment_text": text, "screenshot": ss, "html": html, "reason": "submitted-not-verified"}
        except Exception as ex:
            ss, html = await _save_debug(page, f"error-{int(time.time())}")
            return {"ok": False, "message": f"Error during submit: {ex}. Saved artifacts.", "comment_text": text, "screenshot": ss, "html": html, "reason": "submit-error"}
