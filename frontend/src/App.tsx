import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import viVN from 'antd/locale/vi_VN';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import { authService } from './services/authService';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsAuthenticated(authService.isAuthenticated());
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'wiaccount_login_success') {
        const { access_token, refresh_token } = event.data;
        authService.setTokens(access_token, refresh_token);
        setIsAuthenticated(true);
        message.success('Đăng nhập thành công!');
      } else if (event.data?.type === 'wiaccount_login_failed') {
        message.error(event.data.error || 'Đăng nhập thất bại!');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    message.success('Đăng xuất thành công!');
  };

  if (isLoading) {
    return (
      <ConfigProvider locale={viVN}>
        <div className="App" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div>Đang tải...</div>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={viVN}>
      <Router>
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route path="/dashboard" element={isAuthenticated ? <DashboardPage onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
