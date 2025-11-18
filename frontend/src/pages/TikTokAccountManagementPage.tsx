import React, { useState, useEffect, useRef } from 'react';
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
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons';
import { tiktokSessionService, TikTokSession, TikTokSessionCreate } from '../services/tiktokSessionService';
import TikTokLayout from '../components/TikTokLayout';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;

interface ImportAccount {
  key: string;
  account: string;
  password: string;
  tiktok_name?: string;
}

const TikTokAccountManagementPage: React.FC = () => {
  const [sessions, setSessions] = useState<TikTokSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSession, setEditingSession] = useState<TikTokSession | null>(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ page: 1, size: 10, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<number[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<ImportAccount[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<React.Key[]>([]);
  const [visiblePreviewPasswords, setVisiblePreviewPasswords] = useState<Record<string, boolean>>({});

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

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswordIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('file', file);

    setImporting(true);
    try {
      const preview = await tiktokSessionService.previewImport(formData);
      const accounts = (preview.accounts || []).map((acc: TikTokSessionCreate, index: number) => ({
        key: acc.account || `row-${index}`,
        account: acc.account || '',
        password: acc.password || '',
        tiktok_name: acc.tiktok_name || '',
      }));
      if (!accounts.length) {
        message.warning('Không tìm thấy tài khoản hợp lệ trong file.');
      } else {
        setImportPreviewData(accounts);
        setSelectedImportKeys(accounts.map((acc) => acc.key));
        setImportModalVisible(true);
      }
    } catch (error: any) {
      message.error('Không thể đọc file: ' + (error.response?.data || error.message));
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImportSelected = async () => {
    const selectedAccounts = importPreviewData.filter((acc) => selectedImportKeys.includes(acc.key));
    if (!selectedAccounts.length) {
      message.warning('Vui lòng chọn ít nhất một tài khoản.');
      return;
    }

    setImporting(true);
    try {
      const payload = selectedAccounts.map((acc) => ({
        account: acc.account,
        password: acc.password,
        tiktok_name: acc.tiktok_name,
      }));
      const result = await tiktokSessionService.importSessions(payload);
      const successCount = result.results?.filter((r: any) => r.status === 'success').length ?? 0;
      message.success(`Đăng nhập thành công ${successCount}/${result.total} tài khoản.`);
      setImportModalVisible(false);
      setImportPreviewData([]);
      setSelectedImportKeys([]);
      loadSessions(pagination.page);
    } catch (error: any) {
      message.error('Không thể đăng nhập các tài khoản đã chọn: ' + (error.response?.data || error.message));
    } finally {
      setImporting(false);
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
      title: 'Account',
      dataIndex: 'account',
      key: 'account',
      width: 160,
      render: (text) => text || '-',
    },
    {
      title: 'Password',
      dataIndex: 'password',
      key: 'password',
      width: 180,
      render: (_, record) => {
        const visible = visiblePasswordIds.includes(record.id);
        const value = record.password || '';
        return (
          <Space size="small">
            <span>{visible ? value || '-' : value ? '••••••' : '-'}</span>
            {value && (
              <Button
                type="link"
                size="small"
                onClick={() => togglePasswordVisibility(record.id)}
              >
                {visible ? 'Ẩn' : 'Hiện'}
              </Button>
            )}
          </Space>
        );
      },
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
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>Quản lý Tài khoản TikTok</Title>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<UploadOutlined />}
                onClick={handleImportClick}
                loading={importing}
              >
                Import Excel
              </Button>
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

      <Modal
        title="Chọn tài khoản để đăng nhập"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        width={700}
        footer={[
          <Button key="cancel" onClick={() => setImportModalVisible(false)}>
            Hủy
          </Button>,
          <Button
            key="import"
            type="primary"
            onClick={handleImportSelected}
            loading={importing}
            disabled={!selectedImportKeys.length}
          >
            Đăng nhập tài khoản đã chọn
          </Button>,
        ]}
      >
        <Table
          dataSource={importPreviewData}
          rowKey="key"
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedImportKeys,
            onChange: (keys) => setSelectedImportKeys(keys),
          }}
          columns={[
            {
              title: 'Account',
              dataIndex: 'account',
              key: 'account',
            },
            {
              title: 'Password',
              dataIndex: 'password',
              key: 'password',
              render: (text, record) => {
                const visible = visiblePreviewPasswords[record.key];
                return (
                  <Space size="small">
                    <span>{visible ? text : '••••••'}</span>
                    {text && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          setVisiblePreviewPasswords((prev) => ({
                            ...prev,
                            [record.key]: !prev[record.key],
                          }))
                        }
                      >
                        {visible ? 'Ẩn' : 'Hiện'}
                      </Button>
                    )}
                  </Space>
                );
              },
            },
            {
              title: 'Tên TikTok',
              dataIndex: 'tiktok_name',
              key: 'tiktok_name',
            },
          ]}
        />
      </Modal>
    </TikTokLayout>
  );
};

export default TikTokAccountManagementPage;

