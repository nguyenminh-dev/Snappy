from flask import Blueprint, request, jsonify, Response
from sqlalchemy import desc

from domain.db import db
from domain.models.TikTokSession import TikTokSession
from services.tiktokService import build_tiktok_session_payload
import asyncio

tiktok_session_blueprint = Blueprint("tiktok_session_blueprint", __name__)


# --------------------------------------------------------
# Helpers
# --------------------------------------------------------

def _get_session_by_id(id: int) -> TikTokSession | None:
    return TikTokSession.query.filter(TikTokSession.id == id).first()


def _get_latest_session() -> TikTokSession | None:
    return TikTokSession.query.order_by(desc(TikTokSession.id)).first()


# --------------------------------------------------------
# API
# --------------------------------------------------------

@tiktok_session_blueprint.route("/tiktok/sessions", methods=["GET"])
def get_tiktok_sessions():
    """
    Lấy danh sách TikTokSession (mặc định lấy 50 bản ghi mới nhất).
    Hỗ trợ phân trang:
    - ?page=1&size=20
    """
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 50))

    query = TikTokSession.query.order_by(desc(TikTokSession.id))
    pagination = query.paginate(page=page, per_page=size, error_out=False)

    return jsonify({
        "items": [x.to_dict() for x in pagination.items],
        "page": page,
        "size": size,
        "total": pagination.total,
        "pages": pagination.pages
    }), 200


@tiktok_session_blueprint.route("/tiktok/session/<int:id>", methods=["GET"])
def get_session_by_id(id: int):
    """
    Lấy 1 session theo ID.
    """
    session = _get_session_by_id(id)
    if session is None:
        return Response("TikTok session not found.", status=404)

    return jsonify(session.to_dict()), 200


@tiktok_session_blueprint.route("/tiktok/session", methods=["GET"])
def get_latest_tiktok_session():
    """
    Lấy session mới nhất (backward compatibility)
    """
    session = _get_latest_session()
    if session is None:
        return Response("TikTok session not found.", status=404)

    return jsonify(session.to_dict()), 200


@tiktok_session_blueprint.route("/tiktok/session", methods=["POST"])
def create_tiktok_session():
    """
    Tạo session từ JSON body.
    """
    body = request.get_json(silent=True)
    if body is None:
        return Response("Invalid JSON.", status=400)

    session = TikTokSession.from_session_payload(body)

    db.session.add(session)
    db.session.commit()

    return jsonify(session.to_dict()), 201


@tiktok_session_blueprint.route("/tiktok/session/sign-in", methods=["POST"])
def auto_create_tiktok_session():
    """
    Tạo session qua hàm sign_in async (login TikTok thực tế).
    """
    try:
        payload = asyncio.run(build_tiktok_session_payload())
    except Exception as ex:
        return Response(str(ex), status=400)

    session = TikTokSession.from_session_payload(payload)
    db.session.add(session)
    db.session.commit()

    return jsonify(session.to_dict()), 201


@tiktok_session_blueprint.route("/tiktok/session/<int:id>", methods=["PUT"])
def update_session(id: int):
    """
    Cập nhật session theo ID.
    Body: chỉ các field muốn update.
    """
    body = request.get_json(silent=True)
    if body is None:
        return Response("Invalid JSON.", status=400)

    session = _get_session_by_id(id)
    if session is None:
        return Response("TikTok session not found.", status=404)

    # sử dụng model.update_from_payload() cho sạch logic
    session.update_from_payload(body)

    db.session.commit()
    return jsonify(session.to_dict()), 200
