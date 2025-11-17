import React from 'react';
import { Card, Button } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { authService } from '../services/authService';
import { message } from 'antd';

const LoginPage: React.FC = () => {
  const handleLogin = async () => {
    const popup = await authService.initiateLoginWithPopup();
    if (!popup) return;

    const handleMessage = (event: MessageEvent) => {
      console.log('Received message from popup:', event.data);
      if (event.data && event.data.type === 'wiaccount_login_success') {
        if (event.data.access_token) localStorage.setItem('access_token', event.data.access_token);
        if (event.data.refresh_token) localStorage.setItem('refresh_token', event.data.refresh_token);
        window.location.reload();
        window.removeEventListener('message', handleMessage);
        if (popup) popup.close();
      } else if (event.data && event.data.type === 'wiaccount_login_failed') {
        window.removeEventListener('message', handleMessage);
        if (popup) popup.close();
        // Hiển thị thông báo lỗi cho người dùng
        message.error(event.data.error || 'Đăng nhập thất bại!');
      }
    };

    window.addEventListener('message', handleMessage);
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="logo" style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="https://static-tds-public-projects.tmtco.org/branding-assets/logos/wi/wion-pos/hoz/light.svg" alt="WIONPOS" style={{ height: '80px', marginBottom: '10px' }} />
        </div>
        <Button
          type="primary"
          size="large"
          icon={<LoginOutlined />}
          onClick={handleLogin}
          style={{ width: '100%', height: '50px', fontSize: '1.1rem', backgroundColor: '#14bd2a', borderColor: '#14bd2a' }}
        >
          Đăng nhập bằng WiAccount
        </Button>
      </Card>
    </div>
  );
};

export default LoginPage;
