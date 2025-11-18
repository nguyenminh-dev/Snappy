from flask import Blueprint, request, jsonify, Response
from sqlalchemy import desc
import pandas as pd
import asyncio

from domain.db import db
from domain.models.TikTokSession import TikTokSession
from services.tiktokService import (
    build_tiktok_session_payload,
    post_comment_with_ui,
    auto_comment_with_ui,
    build_session_from_account,
)

tiktok_session_blueprint = Blueprint("tiktok_session_blueprint", __name__)


# --------------------------------------------------------
# Helpers
# --------------------------------------------------------

def _get_session_by_id(id: int) -> TikTokSession | None:
    return TikTokSession.query.filter(TikTokSession.id == id).first()


def _get_latest_session() -> TikTokSession | None:
    return TikTokSession.query.order_by(desc(TikTokSession.id)).first()


def _parse_accounts_from_excel(file_storage):
    try:
        df = pd.read_excel(file_storage)
    except Exception:
        raise ValueError("Invalid Excel file")

    accounts = []

    def extract_value(row, keys):
        for key in keys:
            if key in row and not pd.isna(row[key]):
                return str(row[key]).strip()
        return None

    for _, row in df.iterrows():
        account = extract_value(row, ["account", "Account", "email", "Email", "username", "Username"])
        password = extract_value(row, ["password", "Password", "pass"])
        username = extract_value(row, ["tiktok_name", "TikTokName", "UserName", "username", "Username"]) or account

        if account and password:
            accounts.append({
                "account": account,
                "password": password,
                "tiktok_name": username
            })

    return accounts


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


@tiktok_session_blueprint.route("/tiktok/session/import/preview", methods=["POST"])
def preview_import_tiktok_sessions():
    """
    Parse file Excel và trả về danh sách tài khoản để người dùng lựa chọn.
    ---
    tags:
      - TikTok Session
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
        description: File Excel chứa các cột Account, Password, UserName
    responses:
      200:
        description: Danh sách tài khoản parse được
    """
    file = request.files.get("file")
    if file is None:
        return Response("Missing file", status=400)

    try:
        accounts = _parse_accounts_from_excel(file)
    except ValueError as ex:
        return Response(str(ex), status=400)

    return jsonify({
        "total": len(accounts),
        "accounts": accounts
    }), 200


@tiktok_session_blueprint.route("/tiktok/session/import", methods=["POST"])
def import_tiktok_sessions():
    """
    Đăng nhập các tài khoản đã chọn và lưu session.
    ---
    tags:
      - TikTok Session
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            accounts:
              type: array
              items:
                type: object
                properties:
                  account:
                    type: string
                  password:
                    type: string
                  tiktok_name:
                    type: string
          required:
            - accounts
    responses:
      200:
        description: Kết quả import
    """
    accounts_payload = None
    file = request.files.get("file")

    if file:
        try:
            accounts_payload = _parse_accounts_from_excel(file)
        except ValueError as ex:
            return Response(str(ex), status=400)
    else:
        data = request.get_json(silent=True) or {}
        accounts_payload = data.get("accounts")

    if not accounts_payload:
        return Response("Missing accounts", status=400)

    results = []

    for account_info in accounts_payload:
        account = account_info.get("account")
        password = account_info.get("password")
        username = account_info.get("tiktok_name") or account

        if not account or not password:
            results.append({
                "account": account,
                "status": "skipped",
                "reason": "Missing account or password"
            })
            continue

        try:
            payload = asyncio.run(build_session_from_account(account, password, username))
            if payload is None:
                results.append({
                    "account": account,
                    "status": "failed",
                    "reason": "Login failed"
                })
                continue

            payload["account"] = account
            payload["password"] = password

            existing = TikTokSession.query.filter_by(account=account).first()
            if existing:
                existing.update_from_payload(payload)
                action = "updated"
            else:
                session = TikTokSession.from_session_payload(payload)
                db.session.add(session)
                action = "created"

            db.session.commit()
            results.append({
                "account": account,
                "status": "success",
                "action": action
            })
        except Exception as ex:
            db.session.rollback()
            results.append({
                "account": account,
                "status": "failed",
                "reason": str(ex)
            })

    return jsonify({
        "total": len(results),
        "results": results
    }), 200


@tiktok_session_blueprint.route("/tiktok/auto-comment", methods=["POST"])
def auto_comment_multiple_accounts():
    """
    Đăng nhiều comment vào cùng một video bằng nhiều tài khoản.
    ---
    tags:
      - TikTok Session
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            video_url:
              type: string
              description: URL video TikTok
            comments:
              type: array
              items:
                type: object
                properties:
                  session_id:
                    type: integer
                  text:
                    type: string
          required:
            - video_url
            - comments
    responses:
      200:
        description: Kết quả đăng comment
    """
    body = request.get_json(silent=True)
    if body is None:
        return Response("Invalid JSON.", status=400)

    video_url = body.get("video_url")
    comments = body.get("comments")

    if not video_url or not comments:
        return Response("Missing video_url or comments", status=400)

    items = []
    for comment in comments:
        session_id = comment.get("session_id")
        text = comment.get("text")

        if not session_id or not text:
            return Response("Each comment entry must include session_id and text", status=400)

        session = _get_session_by_id(session_id)
        if session is None:
            return Response(f"TikTok session {session_id} not found.", status=404)

        items.append({
            "session_data": session.to_dict(),
            "text": text,
            "video_url": video_url,
        })

    try:
        results = asyncio.run(auto_comment_with_ui(items))
        return jsonify({
            "success": True,
            "results": results,
        }), 200
    except Exception as ex:
        return Response(str(ex), status=400)


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
        result = asyncio.run(post_comment_with_ui(session_data, text, video_url))
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
