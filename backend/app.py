import os
from flask import Flask
from domain.db import db
from flask_cors import CORS
from dotenv import load_dotenv
from flasgger import Swagger
from utils.errors import BadRequestException
from blueprints.tiktok_session import tiktok_session_blueprint
from utils.http import bad_request, not_found, not_allowed, internal_error

env_file = ".env.development" if os.getenv("FLASK_ENV") != "production" else ".env.production"
load_dotenv(env_file)

def create_app():
    app = Flask(__name__)
    app.config.from_object(os.getenv('APP_SETTINGS'))
    app.url_map.strict_slashes = False
    db.init_app(app)
    CORS(app)

    # Swagger configuration
    swagger_config = {
        "headers": [],
        "specs": [
            {
                "endpoint": "apispec",
                "route": "/apispec.json",
                "rule_filter": lambda rule: True,
                "model_filter": lambda tag: True,
            }
        ],
        "static_url_path": "/flasgger_static",
        "swagger_ui": True,
        "specs_route": "/api-docs"
    }
    
    swagger_template = {
        "swagger": "2.0",
        "info": {
            "title": "Snappy Backend API",
            "description": "API documentation for Snappy Backend - TikTok Session Management",
            "version": "1.0.0",
            "contact": {
                "name": "API Support"
            }
        },
        "basePath": "/api/v1",
        "schemes": ["http", "https"],
        "tags": [
            {
                "name": "TikTok Session",
                "description": "Operations related to TikTok session management"
            }
        ],
        "definitions": {
            "TikTokSession": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "tiktok_name": {"type": "string"},
                    "ms_token": {"type": "string"},
                    "cookies": {"type": "array", "items": {"type": "object"}},
                    "storage_state": {"type": "object"},
                    "user_agent": {"type": "string"},
                    "browser": {"type": "string"},
                    "headless": {"type": "boolean"},
                    "saved_at": {"type": "string", "format": "date-time"},
                    "created": {"type": "string", "format": "date-time"},
                    "updated": {"type": "string", "format": "date-time"}
                }
            },
            "TikTokSessionCreate": {
                "type": "object",
                "required": [],
                "properties": {
                    "tiktok_name": {"type": "string", "description": "Tên TikTok account"},
                    "ms_token": {"type": "string", "description": "TikTok ms_token"},
                    "cookies": {"type": "array", "items": {"type": "object"}, "description": "Cookies từ TikTok"},
                    "storage_state": {"type": "object", "description": "Storage state từ browser"},
                    "user_agent": {"type": "string", "description": "User agent string"},
                    "browser": {"type": "string", "description": "Browser type (chromium, firefox, webkit)"},
                    "headless": {"type": "boolean", "description": "Headless mode"},
                    "saved_at": {"type": "string", "format": "date-time", "description": "Thời điểm lưu session"}
                }
            },
            "TikTokSessionUpdate": {
                "type": "object",
                "properties": {
                    "tiktok_name": {"type": "string"},
                    "ms_token": {"type": "string"},
                    "cookies": {"type": "array", "items": {"type": "object"}},
                    "storage_state": {"type": "object"},
                    "user_agent": {"type": "string"},
                    "browser": {"type": "string"},
                    "headless": {"type": "boolean"},
                    "saved_at": {"type": "string", "format": "date-time"}
                }
            }
        }
    }
    
    Swagger(app, config=swagger_config, template=swagger_template)

    app.register_blueprint(tiktok_session_blueprint, url_prefix='/api/v1')

    @app.errorhandler(BadRequestException)
    def bad_request_exception(e):
        return bad_request(e)

    @app.errorhandler(404)
    def route_not_found(e):
        return not_found('route')

    @app.errorhandler(405)
    def method_not_allowed(e):
        return not_allowed()

    @app.errorhandler(Exception)
    def internal_server_error(e):
        return internal_error()

    return app

app = create_app()
