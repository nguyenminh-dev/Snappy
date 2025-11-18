from app import app
import os

if __name__ == '__main__':
    # Lấy port từ environment hoặc dùng mặc định 5000
    port = int(os.getenv('PORT', 5000))
    # Lấy host từ environment hoặc dùng mặc định 0.0.0.0 (cho phép truy cập từ bên ngoài)
    host = os.getenv('HOST', '0.0.0.0')
    # Debug mode nếu là development
    debug = os.getenv('FLASK_ENV') == 'development'
    
    print(f"🚀 Starting server on http://{host}:{port}")
    print(f"📝 Debug mode: {debug}")
    
    app.run(host=host, port=port, debug=debug)
