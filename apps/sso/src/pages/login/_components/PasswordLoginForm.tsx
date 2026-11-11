import { LockOutlined, LoginOutlined, UserOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { Button, Form, Input } from "antd";
import type { ReactNode } from "react";

export type PasswordLoginValues = {
  username: string;
  password: string;
};

type PasswordLoginFormProps = {
  form: FormInstance<PasswordLoginValues>;
  submitting: boolean;
  captcha?: ReactNode;
  onValuesChange: () => void;
  onForgotPassword: () => void;
  onSubmit: (values: PasswordLoginValues) => void | Promise<void>;
};

export function PasswordLoginForm({
  form,
  submitting,
  captcha,
  onValuesChange,
  onForgotPassword,
  onSubmit,
}: PasswordLoginFormProps) {
  return (
    <Form form={form} layout="vertical" onFinish={onSubmit} onValuesChange={onValuesChange} requiredMark={false}>
      <Form.Item label="工号 / 账号" name="username" rules={[{ required: true, message: "请输入您的工号" }]}>
        <Input size="large" placeholder="请输入您的工号" prefix={<UserOutlined />} />
      </Form.Item>
      <div className="login-actions">
        <span className="login-actions-label">登录密码</span>
        <Button className="forgot-link" type="link" style={{ height: "auto", padding: 0 }} onClick={onForgotPassword}>
          忘记密码？
        </Button>
      </div>
      <Form.Item name="password" rules={[{ required: true, message: "请输入登录密码" }]}>
        <Input.Password size="large" placeholder="请输入登录密码" prefix={<LockOutlined />} />
      </Form.Item>
      {captcha}
      <Button
        className="login-submit"
        type="primary"
        size="large"
        htmlType="submit"
        icon={<LoginOutlined />}
        loading={submitting && !captcha}
        disabled={submitting}
      >
        安全登录
      </Button>
    </Form>
  );
}
