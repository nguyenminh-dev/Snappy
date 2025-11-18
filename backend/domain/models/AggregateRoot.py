from domain.db import db
from datetime import datetime
import json
from typing import Any, Optional, Union

class AggregateRoot:
    created = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated = db.Column(
        db.DateTime, default=datetime.now, onupdate=datetime.now)
    
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