"""
Script để chạy Flask-Migrate commands.
Cách dùng:
    python manage.py init                    # Khởi tạo migrations (chỉ chạy 1 lần)
    python manage.py migrate "message"       # Tạo migration mới
    python manage.py upgrade                 # Áp dụng migration
    python manage.py downgrade [revision]    # Rollback migration
    python manage.py history                 # Xem lịch sử
    python manage.py current                 # Xem migration hiện tại
"""
import sys
import os

# Đảm bảo import từ thư mục hiện tại
sys.path.insert(0, os.path.dirname(__file__))

from app import app
from domain.db import db
from flask_migrate import Migrate

# Import models để Flask-Migrate có thể detect
from domain.models.TikTokSession import TikTokSession

migrate = Migrate(app, db)

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    with app.app_context():
        try:
            if command == 'init':
                from flask_migrate import init as migrate_init
                migrate_init(directory='migrations')
                print("✅ Đã khởi tạo thư mục migrations")
                
            elif command == 'migrate':
                from flask_migrate import migrate as migrate_create
                message = sys.argv[2] if len(sys.argv) > 2 else "Auto migration"
                migrate_create(message=message, directory='migrations')
                print(f"✅ Đã tạo migration: {message}")
                
            elif command == 'upgrade':
                from flask_migrate import upgrade as migrate_upgrade
                migrate_upgrade(directory='migrations')
                print("✅ Đã áp dụng migration vào database")
                
            elif command == 'downgrade':
                from flask_migrate import downgrade as migrate_downgrade
                revision = sys.argv[2] if len(sys.argv) > 2 else None
                if revision:
                    migrate_downgrade(revision, directory='migrations')
                    print(f"✅ Đã rollback về: {revision}")
                else:
                    migrate_downgrade(directory='migrations')
                    print("✅ Đã rollback về migration trước đó")
                    
            elif command == 'history':
                from flask_migrate import history as migrate_history
                migrate_history(directory='migrations')
                
            elif command == 'current':
                from flask_migrate import current as migrate_current
                migrate_current(directory='migrations')
                
            else:
                print(f"❌ Lệnh không hợp lệ: {command}")
                print(__doc__)
                sys.exit(1)
                
        except Exception as e:
            print(f"❌ Lỗi: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == '__main__':
    main()