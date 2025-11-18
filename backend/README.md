# Backend - Snappy

Backend API sử dụng Flask, Flask-SQLAlchemy, và TikTok API.

## 📋 Yêu cầu

- Python 3.10+
- PostgreSQL (hoặc database khác)
- Playwright browsers (sẽ tự động cài khi cài dependencies)

## 🚀 Cài đặt

### 1. Cài đặt dependencies

```bash
pip install -r requirements.txt
```

### 2. Cài đặt Playwright browsers

```bash
playwright install chromium
```

### 3. Cấu hình Environment Variables

Tạo file `.env.development` (cho development) hoặc `.env.production` (cho production):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/snappy_db

# Flask Config
APP_SETTINGS=config.config.DevelopmentConfig
FLASK_ENV=development

# TikTok API
ms_token=your_ms_token_here
TIKTOK_BROWSER=chromium
```

**Lưu ý:** 
- `DATABASE_URL`: Connection string cho database
- `APP_SETTINGS`: `config.config.DevelopmentConfig` (dev) hoặc `config.config.ProductionConfig` (prod)
- `ms_token`: TikTok ms_token để đăng nhập

### 4. Chạy Migrations

```bash
# Khởi tạo migrations (chỉ chạy 1 lần đầu)
python manage.py init

# Tạo migration mới (khi thay đổi models)
python manage.py migrate "Description of changes"

# Áp dụng migration vào database
python manage.py upgrade
```

## 🏃 Chạy Backend

### Cách 1: Dùng server.py (đơn giản)

```bash
python server.py
```

Server sẽ chạy tại: `http://localhost:5000`

### Cách 2: Dùng Flask CLI

```bash
# Set FLASK_APP (Windows PowerShell)
$env:FLASK_APP="app.py"
$env:FLASK_ENV="development"

# Set FLASK_APP (Windows CMD)
set FLASK_APP=app.py
set FLASK_ENV=development

# Set FLASK_APP (Linux/Mac)
export FLASK_APP=app.py
export FLASK_ENV=development

# Chạy server
flask run
```

### Cách 3: Dùng setup.py (tự động cài dependencies)

```bash
python setup.py
```

## 📡 API Endpoints

### Swagger Documentation

Sau khi chạy server, truy cập Swagger UI tại:
- **Swagger UI**: `http://localhost:5000/api-docs`
- **API Spec JSON**: `http://localhost:5000/apispec.json`

Swagger UI cho phép bạn:
- Xem tất cả API endpoints
- Test API trực tiếp từ browser
- Xem request/response schemas
- Xem examples và descriptions

### TikTok Session Management

- `GET /api/v1/tiktok/sessions` - Lấy danh sách sessions (phân trang)
- `GET /api/v1/tiktok/session` - Lấy session mới nhất
- `GET /api/v1/tiktok/session/<id>` - Lấy session theo ID
- `POST /api/v1/tiktok/session` - Tạo session từ JSON body
- `POST /api/v1/tiktok/session/sign-in` - Tạo session bằng cách đăng nhập TikTok tự động
- `PUT /api/v1/tiktok/session/<id>` - Cập nhật session

## 🔧 Development

### Chạy với debug mode

Sửa `server.py` hoặc dùng:

```bash
flask run --debug
```

### Xem logs

Logs sẽ hiển thị trong console khi chạy server.

## 📝 Notes

- Đảm bảo database đã được tạo trước khi chạy migrations
- TikTok API cần `ms_token` hợp lệ để đăng nhập
- Playwright cần cài browsers trước khi sử dụng TikTok API

