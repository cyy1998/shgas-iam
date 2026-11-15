import { Button, Form, Input } from "antd";
import type { ReactNode } from "react";
import type { PasswordLoginValues } from "./PasswordLoginForm";

export function WechatBindingPasswordForm({
  submitting,
  captcha,
  error,
  onChange,
  onSubmit,
}: {
  submitting: boolean;
  captcha?: ReactNode;
  error?: string;
  onChange: () => void;
  onSubmit: (values: PasswordLoginValues) => Promise<void>;
}) {
  return (
    <Form
      name="wechat-binding-password"
      layout="vertical"
      onFinish={onSubmit}
      onValuesChange={onChange}
      requiredMark={false}
    >
      <Form.Item
        label="工号 / 账号"
        name="username"
        rules={[{ required: true, whitespace: true, message: "请输入您的工号" }]}
      >
        <Input autoComplete="username" disabled={submitting} />
      </Form.Item>
      <Form.Item
        label="登录密码"
        name="password"
        rules={[{ required: true, whitespace: true, message: "请输入登录密码" }]}
      >
        <Input.Password autoComplete="current-password" disabled={submitting} />
      </Form.Item>
      {captcha}
      {error && <p role="alert">{error}</p>}
      <Button type="primary" htmlType="submit" loading={submitting && !captcha} disabled={submitting}>
        验证并绑定企业微信
      </Button>
    </Form>
  );
}
