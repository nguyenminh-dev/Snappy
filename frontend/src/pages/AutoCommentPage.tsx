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
  Spin,
} from 'antd';
import { SendOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { tiktokSessionService, TikTokSession } from '../services/tiktokSessionService';
import { autoCommentService, PostCommentRequest } from '../services/autoCommentService';
import TikTokLayout from '../components/TikTokLayout';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const AutoCommentPage: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TikTokSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

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

  const handleSubmit = async (values: any) => {
    if (!values.video_url || !values.text || !values.session_id) {
      message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }

    setSubmitting(true);
    try {
      const result = await autoCommentService.postComment(values.session_id, {
        video_url: values.video_url,
        text: values.text,
      });
      
      if (result.success) {
        message.success('Comment đã được đăng thành công!');
        form.resetFields(['video_url', 'text']);
      } else {
        message.error(result.message || 'Có lỗi xảy ra');
      }
    } catch (error: any) {
      message.error('Không thể đăng comment: ' + (error.response?.data || error.message));
    } finally {
      setSubmitting(false);
    }
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
            name="session_id"
            label="Chọn tài khoản TikTok"
            rules={[{ required: true, message: 'Vui lòng chọn tài khoản' }]}
          >
            <Select
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

          <Form.Item
            name="text"
            label="Nội dung Comment"
            rules={[
              { required: true, message: 'Vui lòng nhập nội dung comment' },
              { max: 500, message: 'Comment không được quá 500 ký tự' },
            ]}
          >
            <TextArea
              rows={4}
              placeholder="Nhập nội dung comment..."
              showCount
              maxLength={500}
            />
          </Form.Item>

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

