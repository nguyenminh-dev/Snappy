import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Select,
  message,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Tag,
} from 'antd';
import { SendOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { tiktokSessionService, TikTokSession } from '../services/tiktokSessionService';
import { autoCommentService } from '../services/autoCommentService';
import TikTokLayout from '../components/TikTokLayout';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const AutoCommentPage: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TikTokSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [commentMap, setCommentMap] = useState<Record<number, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});

  const loadSessions = async () => {
    setLoading(true);
    try {
      const response = await tiktokSessionService.getSessions(1, 100);
      setSessions(response.items);
    } catch (error: any) {
      message.error('Không thể tải danh sách tài khoản: ' + (error.response?.data || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleSelectSessions = (ids: number[]) => {
    setSelectedSessionIds(ids);
    setCommentMap((prev) => {
      const updated = { ...prev };
      ids.forEach((id) => {
        if (!(id in updated)) {
          updated[id] = '';
        }
      });
      Object.keys(updated).forEach((key) => {
        const numericKey = Number(key);
        if (!ids.includes(numericKey)) {
          delete updated[numericKey];
        }
      });
      return updated;
    });
  };

  const handleSubmit = async (values: any) => {
    const videoUrl = values.video_url;
    const sessionIds: number[] = values.session_ids || [];

    if (!videoUrl) {
      message.warning('Vui lòng nhập URL video');
      return;
    }

    if (!sessionIds.length) {
      message.warning('Vui lòng chọn ít nhất một tài khoản');
      return;
    }

    const payload = sessionIds.map((id) => ({
      session_id: id,
      text: (commentMap[id] || '').trim(),
    }));

    if (payload.some((item) => !item.text)) {
      message.warning('Vui lòng nhập comment cho tất cả tài khoản đã chọn');
      return;
    }

    setSubmitting(true);
    try {
      await autoCommentService.postCommentBatch({
        video_url: videoUrl,
        comments: payload,
      });
      message.success(`Đã gửi ${payload.length} comment`);
      form.resetFields(['session_ids', 'video_url']);
      setSelectedSessionIds([]);
      setCommentMap({});
    } catch (error: any) {
      message.error('Không thể đăng comment: ' + (error.response?.data || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <TikTokLayout>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>Auto Comment</Title>
            <Paragraph type="secondary">
              Tự động đăng comment vào video TikTok sử dụng tài khoản đã lưu
            </Paragraph>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadSessions}
              loading={loading}
            >
              Làm mới danh sách
            </Button>
          </Col>
        </Row>

        {sessions.length === 0 && (
          <Alert
            message="Chưa có tài khoản TikTok"
            description="Vui lòng thêm tài khoản TikTok trước khi sử dụng tính năng Auto Comment. Truy cập Quản lý Tài khoản TikTok để thêm tài khoản mới."
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
            action={
              <Button size="small" onClick={() => navigate('/tiktok/accounts')}>
                Thêm tài khoản
              </Button>
            }
          />
        )}
        
        <Alert
          message="Hướng dẫn"
          description="Chọn tài khoản TikTok, nhập URL video và nội dung comment. Hệ thống sẽ tự động đăng comment bằng tài khoản đã chọn."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 800 }}
        >
          <Form.Item
            name="session_ids"
            label="Chọn tài khoản TikTok"
            rules={[{ required: true, message: 'Vui lòng chọn tài khoản' }]}
          >
            <Select
              mode="multiple"
              placeholder={sessions.length === 0 ? "Chưa có tài khoản nào. Vui lòng thêm tài khoản trước." : "Chọn tài khoản TikTok"}
              loading={loading}
              showSearch
              optionFilterProp="label"
              disabled={sessions.length === 0}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={sessions.map((session) => ({
                value: session.id,
                label: `${session.tiktok_name || `Session #${session.id}`} (${session.browser || 'chromium'})`,
              }))}
              onChange={(ids) => handleSelectSessions(ids as number[])}
            />
          </Form.Item>

          <Form.Item
            name="video_url"
            label="URL Video TikTok"
            rules={[
              { required: true, message: 'Vui lòng nhập URL video' },
              { type: 'url', message: 'URL không hợp lệ' },
            ]}
          >
            <Input
              placeholder="https://www.tiktok.com/@username/video/1234567890"
              size="large"
            />
          </Form.Item>

          {selectedSessionIds.length > 0 && (
            <Card
              type="inner"
              title="Nội dung comment cho từng tài khoản"
              style={{ marginBottom: 24 }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                {selectedSessionIds.map((id) => {
                  const session = sessions.find((s) => s.id === id);
                  if (!session) return null;
                  const password = session.password || '';
                  const passwordVisible = visiblePasswords[id];

                  return (
                    <Card key={id} size="small" style={{ background: '#fafafa' }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Space wrap>
                          <Tag color="blue">{session.tiktok_name || `Session #${session.id}`}</Tag>
                          {session.account && <Tag>{session.account}</Tag>}
                          {password && (
                            <Tag>
                              <Space size="small">
                                Password:
                                <span>{passwordVisible ? password : '••••••'}</span>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => togglePasswordVisibility(id)}
                                >
                                  {passwordVisible ? 'Ẩn' : 'Hiện'}
                                </Button>
                              </Space>
                            </Tag>
                          )}
                        </Space>
                        <TextArea
                          rows={3}
                          placeholder="Nhập nội dung comment cho tài khoản này..."
                          showCount
                          maxLength={500}
                          value={commentMap[id] || ''}
                          onChange={(e) =>
                            setCommentMap((prev) => ({
                              ...prev,
                              [id]: e.target.value,
                            }))
                          }
                        />
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            </Card>
          )}

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={submitting}
              size="large"
            >
              Đăng Comment
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </TikTokLayout>
  );
};

export default AutoCommentPage;

