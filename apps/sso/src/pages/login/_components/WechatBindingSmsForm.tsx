import { VerificationCodeInput } from "@sso/components/VerificationCodeInput";
import { Button, Form, Input } from "antd";
import type { ReactNode } from "react";
import type { SmsLoginValues } from "./SmsLoginForm";

export function WechatBindingSmsForm({
  countdown,
  sending,
  submitting,
  captcha,
  error,
  onChange,
  onSend,
  onSubmit,
}: {
  countdown: number;
  sending: boolean;
  submitting: boolean;
  captcha?: ReactNode;
  error?: string;
  onChange: () => void;
  onSend: (phoneNumber: string) => Promise<void>;
  onSubmit: (values: SmsLoginValues) => Promise<void>;
}) {
  const [form] = Form.useForm<SmsLoginValues>();
  const busy = sending || submitting;
  return (
    <Form
      name="wechat-binding-sms"
      form={form}
      layout="vertical"
      requiredMark={false}
      onValuesChange={onChange}
      onFinish={onSubmit}
    >
      <Form.Item
        label="IAM 已登记的手机号"
        name="phoneNumber"
        rules={[{ required: true, pattern: /^1[3-9]\d{9}$/u, message: "请输入正确的手机号" }]}
      >
        <Input autoComplete="tel" inputMode="tel" disabled={busy} />
      </Form.Item>
      <Form.Item
        label="短信验证码"
        name="code"
        rules={[{ required: true, pattern: /^\d{4}$/u, message: "请输入 4 位短信验证码" }]}
      >
        <VerificationCodeInput
          autoComplete="one-time-code"
          disabled={busy}
          buttonDisabled={busy || countdown > 0}
          buttonText={sending && !captcha ? "发送中" : countdown > 0 ? `${countdown} s` : "获取验证码"}
          onSendCode={async () => {
            const values = await form.validateFields(["phoneNumber"]).catch(() => undefined);
            if (values) await onSend(values.phoneNumber);
          }}
        />
      </Form.Item>
      {captcha}
      {error && <p role="alert">{error}</p>}
      <Button type="primary" htmlType="submit" loading={submitting && !captcha} disabled={busy}>
        验证并绑定企业微信
      </Button>
    </Form>
  );
}
