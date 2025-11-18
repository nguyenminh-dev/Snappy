from flask import Blueprint, request, jsonify, Response
from sqlalchemy import desc

from domain.db import db
from domain.models.TikTokSession import TikTokSession
from services.tiktokService import build_tiktok_session_payload, post_comment_with_saved_session
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
    Lấy danh sách TikTokSession với phân trang
    ---
    tags:
      - TikTok Session
    parameters:
      - name: page
        in: query
        type: integer
        default: 1
        description: Số trang
      - name: size
        in: query
        type: integer
        default: 50
        description: Số lượng bản ghi mỗi trang
    responses:
      200:
        description: Danh sách TikTok sessions
        schema:
          type: object
          properties:
            items:
              type: array
              items:
                $ref: '#/definitions/TikTokSession'
            page:
              type: integer
            size:
              type: integer
            total:
              type: integer
            pages:
              type: integer
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
    Lấy TikTok session theo ID
    ---
    tags:
      - TikTok Session
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: ID của session
    responses:
      200:
        description: TikTok session object
        schema:
          $ref: '#/definitions/TikTokSession'
      404:
        description: Session not found
    """
    session = _get_session_by_id(id)
    if session is None:
        return Response("TikTok session not found.", status=404)

    return jsonify(session.to_dict()), 200


@tiktok_session_blueprint.route("/tiktok/session", methods=["GET"])
def get_latest_tiktok_session():
    """
    Lấy TikTok session mới nhất
    ---
    tags:
      - TikTok Session
    responses:
      200:
        description: TikTok session mới nhất
        schema:
          $ref: '#/definitions/TikTokSession'
      404:
        description: Session not found
    """
    session = _get_latest_session()
    if session is None:
        return Response("TikTok session not found.", status=404)

    return jsonify(session.to_dict()), 200


@tiktok_session_blueprint.route("/tiktok/session", methods=["POST"])
def create_tiktok_session():
    """
    Tạo TikTok session mới từ JSON body
    ---
    tags:
      - TikTok Session
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/TikTokSessionCreate'
    responses:
      201:
        description: Session đã được tạo thành công
        schema:
          $ref: '#/definitions/TikTokSession'
      400:
        description: Invalid JSON
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
    Tạo TikTok session bằng cách tự động đăng nhập TikTok
    ---
    tags:
      - TikTok Session
    description: |
      Endpoint này sẽ tự động đăng nhập vào TikTok bằng ms_token từ environment,
      lấy cookies, storage_state, user_agent và lưu vào database.
      Cần cấu hình ms_token trong .env file.
    parameters:
      - name: body
        in: body
        required: false
        schema:
          type: object
          properties:
            tiktok_name:
              type: string
              description: Tên TikTok account (username) để lưu vào session
              example: "mideframe"
    responses:
      201:
        description: Session đã được tạo thành công sau khi đăng nhập
        schema:
          $ref: '#/definitions/TikTokSession'
      400:
        description: Lỗi đăng nhập hoặc không có ms_token
    """
    body = request.get_json(silent=True) or {}
    username = body.get("tiktok_name", "")
    
    try:
        payload = asyncio.run(build_tiktok_session_payload(username))
        if payload is None:
            return Response("Failed to login to TikTok", status=400)
    except Exception as ex:
        return Response(str(ex), status=400)

    session = TikTokSession.from_session_payload(payload)
    db.session.add(session)
    db.session.commit()

    return jsonify(session.to_dict()), 201


@tiktok_session_blueprint.route("/tiktok/session/<int:id>", methods=["PUT"])
def update_session(id: int):
    """
    Cập nhật TikTok session theo ID
    ---
    tags:
      - TikTok Session
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: ID của session cần cập nhật
      - name: body
        in: body
        required: true
        schema:
          $ref: '#/definitions/TikTokSessionUpdate'
    responses:
      200:
        description: Session đã được cập nhật thành công
        schema:
          $ref: '#/definitions/TikTokSession'
      400:
        description: Invalid JSON
      404:
        description: Session not found
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


@tiktok_session_blueprint.route("/tiktok/session/<int:id>/comment", methods=["POST"])
def post_comment_by_session_id(id: int):
    """
    Post comment vào TikTok video sử dụng session theo ID
    ---
    tags:
      - TikTok Session
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: ID của session TikTok
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            video_url:
              type: string
              description: URL của video TikTok cần comment
              example: "https://www.tiktok.com/@username/video/1234567890"
            text:
              type: string
              description: Nội dung comment
              example: "Great video!"
          required:
            - video_url
            - text
    responses:
      200:
        description: Comment đã được post thành công
        schema:
          type: object
          properties:
            success:
              type: boolean
            message:
              type: string
            result:
              type: object
      400:
        description: Invalid request hoặc session không hợp lệ
      404:
        description: Session not found
    """
    body = request.get_json(silent=True)
    if body is None:
        return Response("Invalid JSON.", status=400)
    
    video_url = body.get("video_url")
    text = body.get("text")
    
    if not video_url or not text:
        return Response("Missing video_url or text", status=400)
    
    session = _get_session_by_id(id)
    if session is None:
        return Response("TikTok session not found.", status=404)
    
    try:
        session_data = session.to_dict()
        result = asyncio.run(post_comment_with_saved_session(session_data, text, video_url))
        return jsonify({
            "success": True,
            "message": "Comment posted successfully",
            "result": result
        }), 200
    except Exception as ex:
        return Response(str(ex), status=400)


@tiktok_session_blueprint.route("/tiktok/session/<int:id>", methods=["DELETE"])
def delete_session(id: int):
    """
    Xóa TikTok session theo ID
    ---
    tags:
      - TikTok Session
    parameters:
      - name: id
        in: path
        type: integer
        required: true
        description: ID của session cần xóa
    responses:
      204:
        description: Session đã được xóa thành công
      404:
        description: Session not found
    """
    session = _get_session_by_id(id)
    if session is None:
        return Response("TikTok session not found.", status=404)

    db.session.delete(session)
    db.session.commit()
    return Response(status=204)
