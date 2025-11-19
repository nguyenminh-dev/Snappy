from typing import List, Optional
from pydantic import BaseModel


class TikTokVideoStats(BaseModel):
    diggCount: int
    shareCount: int
    commentCount: int
    playCount: int
    collectCount: int
    downloadCount: Optional[int] = 0
    forwardCount: Optional[int] = 0
    watchCount: Optional[int] = 0
    expandCount: Optional[int] = 0
    reachCount: Optional[int] = 0
    trafficTags: Optional[int] = 0


class TikTokVideoAuthor(BaseModel):
    id: str
    uniqueId: str
    nickname: str
    avatarThumb: Optional[str]


class TikTokVideoMusic(BaseModel):
    id: str
    title: str
    authorName: str
    duration: int
    playUrl: Optional[str]


class TikTokVideoFile(BaseModel):
    ratio: str
    height: int
    width: int
    duration: int
    format: Optional[str]

    bitrate: Optional[int]
    codecType: Optional[str]
    cover: Optional[str]
    originCover: Optional[str]
    playAddr: Optional[str]
    downloadAddr: Optional[str]
    dynamicCover: Optional[str]


class TikTokVideoCover(BaseModel):
    cover: Optional[str]
    originCover: Optional[str]
    dynamicCover: Optional[str]


class TikTokVideoPrivacy(BaseModel):
    isCommentDisabled: bool
    canDuet: bool
    canStitch: bool
    canDownload: bool


class TikTokVideoFeatures(BaseModel):
    duetEnabled: bool
    stitchEnabled: bool
    ads: Optional[dict] = None


class TikTokVideoDto(BaseModel):
    id: str
    desc: Optional[str] = None
    createTime: Optional[int] = None

    video: TikTokVideoFile
    stats: TikTokVideoStats
    author: TikTokVideoAuthor
    music: TikTokVideoMusic

    cover: Optional[TikTokVideoCover] = None
    privacy: Optional[TikTokVideoPrivacy] = None
    features: Optional[TikTokVideoFeatures] = None

