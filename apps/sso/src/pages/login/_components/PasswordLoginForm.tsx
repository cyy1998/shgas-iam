import { LockOutlined, LoginOutlined, UserOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { Button, Form, Input } from 'antd';

export type PasswordLoginValues = {
  username: string;
  password: string;
};

type PasswordLoginFormProps = {
  form: FormInstance<PasswordLoginValues>;
  submitting: boolean;
  onForgotPassword: () => void;
  onSubmit: (values: PasswordLoginValues) => void | Promise<void>;
};

export function PasswordLoginForm({
  form,
  submitting,
  onForgotPassword,
  onSubmit,
}: PasswordLoginFormProps) {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      requiredMark={false}
    >
      <Form.Item
        label="工号 / 账号"
        name="username"
        rules={[{ required: true, message: '请输入您的工号' }]}
      >
        <Input
          size="large"
          placeholder="请输入您的工号"
          prefix={<UserOutlined />}
        />
      </Form.Item>
      <div className="login-actions">
        <span className="login-actions-label">登录密码</span>
        <span className="forgot-link" onClick={onForgotPassword}>
          忘记密码？
        </span>
      </div>
      <Form.Item
        name="password"
        rules={[{ required: true, message: '请输入登录密码' }]}
      >
        <Input.Password
          size="large"
          placeholder="请输入登录密码"
          prefix={<LockOutlined />}
        />
      </Form.Item>
      <Button
        className="login-submit"
        type="primary"
        size="large"
        htmlType="submit"
        icon={<LoginOutlined />}
        loading={submitting}
      >
        安全登录
      </Button>
    </Form>
  );
}
