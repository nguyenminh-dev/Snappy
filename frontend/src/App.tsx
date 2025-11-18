import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import DashboardPage from './pages/DashboardPage';
import TikTokAccountManagementPage from './pages/TikTokAccountManagementPage';
import AutoCommentPage from './pages/AutoCommentPage';
import './App.css';

function App() {
  return (
    <ConfigProvider locale={viVN}>
      <Router>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tiktok/accounts" element={<TikTokAccountManagementPage />} />
          <Route path="/tiktok/auto-comment" element={<AutoCommentPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
