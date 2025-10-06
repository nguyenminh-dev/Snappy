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
                referrer=self.url
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
    async def post_comment(self, text: str, **kwargs) -> dict:
        if not getattr(self, "id", None):
            raise TypeError("Video.id is missing, cannot post comment.")
        
        # Build query params like the observed curl: put everything on the URL, body empty
        i, session = self.parent._get_session(**kwargs)
        base_params = dict(session.params or {})
        params = {
            **base_params,
            "WebIdLastTime": int(time.time()),
            "from_page": "video",
            "user_is_login": "true",
            "data_collection_enabled": "true",
            "aweme_id": self.id,
            "text": text,
            "text_extra": "[]",
        }
        resp = await self.parent.make_request_post(
            url="https://www.tiktok.com/api/comment/publish/",
            data=None,  # empty body -> content-length: 0
            params=params,
            headers=kwargs.get("headers"),
            session_index=kwargs.get("session_index"),
            referrer=self.url,
            use_inpage_sign=True,
        )
        # In case parent.make_request_post is async in this build, await it
        if asyncio.iscoroutine(resp):
            resp = asyncio.get_event_loop().run_until_complete(resp)

        if resp is None:
            raise InvalidResponseException(resp, "TikTok returned no response.")

        status = resp.get("status_code", -1)
        if status == 0 or resp.get("comment") or resp.get("success") or resp.get("ok") is True:
            return {"ok": True, "message": "Comment posted successfully.", "raw": resp}
        else:
            return {"ok": False, "message": "Failed to post comment.", "raw": resp}