import subprocess
import sys

# 1. Cài tất cả package từ requirements.txt
subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

# 2. Chạy Flask app
from app import app

if __name__ == "__main__":
    app.run(debug=True)