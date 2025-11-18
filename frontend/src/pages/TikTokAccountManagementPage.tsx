import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tag,
  Card,
  Typography,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { tiktokSessionService, TikTokSession, TikTokSessionCreate } from '../services/tiktokSessionService';
import TikTokLayout from '../components/TikTokLayout';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;

const TikTokAccountManagementPage: React.FC = () => {
  const [sessions, setSessions] = useState<TikTokSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSession, setEditingSession] = useState<TikTokSession | null>(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ page: 1, size: 10, total: 0 });

  const loadSessions = async (page: number = 1) => {
    setLoading(true);
    try {
      const response = await tiktokSessionService.getSessions(page, pagination.size);
      setSessions(response.items);
      setPagination({
        page: response.page,
        size: response.size,
        total: response.total,
      });
    } catch (error: any) {
      message.error('Không thể tải danh sách tài khoản: ' + (error.response?.data || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleAdd = () => {
    setEditingSession(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (session: TikTokSession) => {
    setEditingSession(session);
    form.setFieldsValue({
      tiktok_name: session.tiktok_name,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await tiktokSessionService.deleteSession(id);
      message.success('Xóa tài khoản thành công');
      loadSessions(pagination.page);
    } catch (error: any) {
      message.error('Không thể xóa tài khoản: ' + (error.response?.data || error.message));
    }
  };

  const handleSignIn = async (tiktokName?: string) => {
    setLoading(true);
    try {
      await tiktokSessionService.signIn(tiktokName);
      message.success('Đăng nhập TikTok thành công');
      loadSessions(pagination.page);
      setModalVisible(false);
    } catch (error: any) {
      message.error('Không thể đăng nhập TikTok: ' + (error.response?.data || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    if (editingSession) {
      try {
        await tiktokSessionService.updateSession(editingSession.id, values);
        message.success('Cập nhật tài khoản thành công');
        setModalVisible(false);
        loadSessions(pagination.page);
      } catch (error: any) {
        message.error('Không thể cập nhật: ' + (error.response?.data || error.message));
      }
    }
  };

  const columns: ColumnsType<TikTokSession> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'Tên TikTok',
      dataIndex: 'tiktok_name',
      key: 'tiktok_name',
      render: (text) => text || <Tag color="default">Chưa đặt tên</Tag>,
    },
    {
      title: 'Browser',
      dataIndex: 'browser',
      key: 'browser',
      width: 100,
    },
    {
      title: 'Headless',
      dataIndex: 'headless',
      key: 'headless',
      width: 100,
      render: (value) => (
        <Tag color={value ? 'orange' : 'green'}>{value ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created',
      key: 'created',
      width: 180,
      render: (text) => text ? new Date(text).toLocaleString('vi-VN') : '-',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Bạn có chắc muốn xóa tài khoản này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <TikTokLayout>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>Quản lý Tài khoản TikTok</Title>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadSessions(pagination.page)}
                loading={loading}
              >
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
              >
                Thêm tài khoản mới
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total: pagination.total,
            onChange: (page) => loadSessions(page),
          }}
        />
      </Card>

      <Modal
        title={editingSession ? 'Sửa tài khoản' : 'Thêm tài khoản TikTok'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingSession ? handleSubmit : (values) => handleSignIn(values.tiktok_name)}
        >
          <Form.Item
            name="tiktok_name"
            label="Tên TikTok Account"
            rules={[{ required: !editingSession, message: 'Vui lòng nhập tên TikTok' }]}
          >
            <Input placeholder="Nhập tên TikTok (ví dụ: mideframe)" />
          </Form.Item>

          {!editingSession && (
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  Đăng nhập TikTok
                </Button>
                <Button onClick={() => setModalVisible(false)}>Hủy</Button>
              </Space>
            </Form.Item>
          )}

          {editingSession && (
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  Cập nhật
                </Button>
                <Button onClick={() => setModalVisible(false)}>Hủy</Button>
              </Space>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </TikTokLayout>
  );
};

export default TikTokAccountManagementPage;

