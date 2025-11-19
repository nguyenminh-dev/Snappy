# mapper.py
from typing import Optional
from contracts.TikTokVideoDto import (
    TikTokVideoDto,
    TikTokVideoStats,
    TikTokVideoAuthor,
    TikTokVideoMusic,
    TikTokVideoFile,
    TikTokVideoCover,
    TikTokVideoPrivacy,
    TikTokVideoFeatures
)

def map_tiktok_response_to_dto(raw: dict) -> TikTokVideoDto:
    """
    Map raw TikTok API response to TikTokVideoDto.
    """
    return TikTokVideoDto(
        id=raw["id"],
        desc=raw.get("desc"),
        createTime=raw.get("createTime"),

        stats=TikTokVideoStats(**raw["stats"]),
        author=TikTokVideoAuthor(**raw["author"]),
        music=TikTokVideoMusic(**raw["music"]),
        video=TikTokVideoFile(**raw["video"]),

        cover=(
            TikTokVideoCover(
                cover=raw["video"].get("cover"),
                originCover=raw["video"].get("originCover"),
                dynamicCover=raw["video"].get("dynamicCover"),
            )
            if raw["video"].get("cover") else None
        ),

        privacy=(
            TikTokVideoPrivacy(
                isCommentDisabled=raw.get("isCommentDisabled", False),
                canDuet=raw.get("duetEnabled", True),
                canStitch=raw.get("stitchEnabled", True),
                canDownload=raw.get("downloadEnabled", True),
            )
            if any(k in raw for k in ["isCommentDisabled", "duetEnabled", "stitchEnabled", "downloadEnabled"]) else None
        ),

        features=(
            TikTokVideoFeatures(
                duetEnabled=raw.get("duetEnabled", True),
                stitchEnabled=raw.get("stitchEnabled", True),
            )
            if any(k in raw for k in ["duetEnabled", "stitchEnabled"]) else None
        ),
    )
