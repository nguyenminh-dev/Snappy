import React from 'react';
import { Layout, Card, Typography, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import { UserOutlined, CommentOutlined } from '@ant-design/icons';
import TikTokLayout from '../components/TikTokLayout';

const { Title, Paragraph } = Typography;
const { Content } = Layout;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <TikTokLayout>
      <Content>
        <Title level={2}>Dashboard</Title>
        <Paragraph>Chào mừng đến với Snappy - Quản lý TikTok</Paragraph>
        
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={24} sm={12} md={8}>
            <Card
              hoverable
              onClick={() => navigate('/tiktok/accounts')}
              style={{ textAlign: 'center', cursor: 'pointer' }}
            >
              <UserOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
              <Title level={4}>Quản lý Tài khoản TikTok</Title>
              <Paragraph type="secondary">
                Thêm, sửa, xóa và quản lý các tài khoản TikTok của bạn
              </Paragraph>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={8}>
            <Card
              hoverable
              onClick={() => navigate('/tiktok/auto-comment')}
              style={{ textAlign: 'center', cursor: 'pointer' }}
            >
              <CommentOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
              <Title level={4}>Auto Comment</Title>
              <Paragraph type="secondary">
                Tự động đăng comment vào video TikTok
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Content>
    </TikTokLayout>
  );
};

export default DashboardPage;

