import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserOutlined, CommentOutlined, DashboardOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Header, Content } = Layout;

interface TikTokLayoutProps {
  children: React.ReactNode;
}

const TikTokLayout: React.FC<TikTokLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>(location.pathname.startsWith('/tiktok') ? ['tiktok'] : []);

  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'tiktok',
      icon: <UserOutlined />,
      label: 'Công cụ',
      children: [
        {
          key: '/tiktok/accounts',
          icon: <UserOutlined />,
          label: 'Quản lý Tài khoản TikTok',
        },
        {
          key: '/tiktok/auto-comment',
          icon: <CommentOutlined />,
          label: 'Auto Comment',
        },
      ],
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key.startsWith('/')) {
      navigate(key);
    }
  };

  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
  };

  const selectedKeys = [location.pathname];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Snappy</h1>
          <Menu
            mode="horizontal"
            selectedKeys={selectedKeys}
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ border: 'none', flex: 1 }}
          />
        </div>
      </Header>
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        {children}
      </Content>
    </Layout>
  );
};

export default TikTokLayout;

