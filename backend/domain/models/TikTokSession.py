# backend/app/models/tiktok_session.py
from datetime import datetime
import json
from typing import Any, Dict, Optional, Union

from domain.db import db
from domain.models.AggregateRoot import AggregateRoot


def _safe_json_load(text: Optional[str]) -> Optional[Union[dict, list]]:
    """Load JSON string an toàn, trả về None nếu lỗi hoặc text rỗng."""
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        # Có thể log lỗi ở đây nếu cần
        return None


def _safe_json_dumps(obj: Any) -> Optional[str]:
    """Dump object sang JSON string an toàn, trả về None nếu obj là None."""
    if obj is None:
        return None
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return None


def _parse_datetime(value: Optional[Union[str, int, float, datetime]]) -> datetime:
    """
    Chuyển value sang datetime an toàn.
    - Nếu value là datetime -> trả về trực tiếp
    - Nếu là ISO string -> try fromisoformat
    - Nếu là số (timestamp) -> từ timestamp
    - Ngược lại -> datetime.utcnow()
    """
    if value is None:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.utcfromtimestamp(float(value))
        except Exception:
            return datetime.utcnow()
    if isinstance(value, str):
        try:
            # Hỗ trợ cả ISO và các dạng có timezone
            # fromisoformat hỗ trợ 'YYYY-MM-DDTHH:MM:SS' (python3.7+)
            return datetime.fromisoformat(value)
        except Exception:
            # thử parse đơn giản (nếu string là timestamp số)
            try:
                ts = float(value)
                return datetime.utcfromtimestamp(ts)
            except Exception:
                return datetime.utcnow()
    return datetime.utcnow()


class TikTokSession(AggregateRoot, db.Model):
    __tablename__ = "AppTikTokSession"

    # Nếu trong AggregateRoot bạn đã có Id mặc định, giữ nguyên; ở đây dùng id int auto
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Thông tin account
    tiktok_id = db.Column(db.String(128), nullable=True)
    tiktok_name = db.Column(db.String(256), nullable=True)

    # Các trường session
    ms_token = db.Column(db.String(512), nullable=True)
    cookies = db.Column(db.Text, nullable=True)  # lưu JSON string
    storage_state = db.Column(db.Text, nullable=True)  # lưu JSON string
    user_agent = db.Column(db.String(512), nullable=True)
    browser = db.Column(db.String(64), nullable=True)
    headless = db.Column(db.Boolean, default=False)

    # Thời điểm session thực tế được lưu từ TikTok
    saved_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Nếu AggregateRoot định nghĩa created/updated, model sẽ kế thừa
    # created = db.Column(db.DateTime, default=datetime.utcnow)
    # updated = db.Column(db.DateTime, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<TikTokSession id={self.id} tiktok_id={self.tiktok_id}>"

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize model thành dict để trả về API.
        Chú ý: cookies/storage_state trả về object (dict/list) hoặc None.
        """
        return {
            "id": self.id,
            "tiktok_id": self.tiktok_id,
            "tiktok_name": self.tiktok_name,
            "ms_token": self.ms_token,
            "cookies": _safe_json_load(self.cookies),
            "storage_state": _safe_json_load(self.storage_state),
            "user_agent": self.user_agent,
            "browser": self.browser,
            "headless": self.headless,
            "saved_at": self.saved_at.isoformat() if self.saved_at else None,
            # Nếu AggregateRoot có created/updated thì trả về, không error nếu không có
            "created": getattr(self, "created", None).isoformat() if getattr(self, "created", None) else None,
            "updated": getattr(self, "updated", None).isoformat() if getattr(self, "updated", None) else None,
        }

    @staticmethod
    def from_session_payload(payload: Dict[str, Any]) -> "TikTokSession":
        """
        Tạo instance từ payload (payload là dict).
        Chấp nhận payload có các key:
          - tiktok_id, tiktok_name, ms_token,
          - cookies (dict or list or JSON string),
          - storage_state (dict or list or JSON string),
          - user_agent, browser, headless,
          - saved_at (ISO string / timestamp / datetime)
        """
        if not isinstance(payload, dict):
            payload = {}

        # Nếu cookies/storage_state truyền vào là dict/list -> chuyển thành JSON string
        cookies_raw = payload.get("cookies")
        storage_raw = payload.get("storage_state")

        cookies_json = _safe_json_dumps(cookies_raw) if not isinstance(cookies_raw, str) else cookies_raw
        storage_json = _safe_json_dumps(storage_raw) if not isinstance(storage_raw, str) else storage_raw

        saved_at = _parse_datetime(payload.get("saved_at"))

        headless_val = payload.get("headless", False)
        # Nếu headless có thể là 'true'/'false' string => chuẩn hoá
        if isinstance(headless_val, str):
            headless_val = headless_val.lower() in ("1", "true", "yes", "y")

        instance = TikTokSession(
            tiktok_id=payload.get("tiktok_id"),
            tiktok_name=payload.get("tiktok_name"),
            ms_token=payload.get("ms_token"),
            cookies=cookies_json,
            storage_state=storage_json,
            user_agent=payload.get("user_agent"),
            browser=payload.get("browser"),
            headless=bool(headless_val),
            saved_at=saved_at,
        )
        return instance

    def update_from_payload(self, payload: Dict[str, Any]) -> None:
        """
        Cập nhật instance hiện có từ payload.
        Không commit DB ở đây — để caller quyết định transaction/commit.
        """
        if not isinstance(payload, dict):
            return

        if "tiktok_id" in payload:
            self.tiktok_id = payload.get("tiktok_id")
        if "tiktok_name" in payload:
            self.tiktok_name = payload.get("tiktok_name")
        if "ms_token" in payload:
            self.ms_token = payload.get("ms_token")

        if "cookies" in payload:
            cookies_raw = payload.get("cookies")
            self.cookies = _safe_json_dumps(cookies_raw) if not isinstance(cookies_raw, str) else cookies_raw

        if "storage_state" in payload:
            storage_raw = payload.get("storage_state")
            self.storage_state = _safe_json_dumps(storage_raw) if not isinstance(storage_raw, str) else storage_raw

        if "user_agent" in payload:
            self.user_agent = payload.get("user_agent")
        if "browser" in payload:
            self.browser = payload.get("browser")
        if "headless" in payload:
            headless_val = payload.get("headless")
            if isinstance(headless_val, str):
                headless_val = headless_val.lower() in ("1", "true", "yes", "y")
            self.headless = bool(headless_val)

        if "saved_at" in payload:
            self.saved_at = _parse_datetime(payload.get("saved_at"))
