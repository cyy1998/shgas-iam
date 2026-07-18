import { LockOutlined, MobileOutlined } from '@ant-design/icons';
import { VerificationCodeInput } from '@sso/components/VerificationCodeInput';
import { Button, Form, Input } from 'antd';
import type { ReactNode } from 'react';

export type SmsLoginValues = {
  phoneNumber: string;
  code: string;
};

type SmsLoginFormProps = {
  countdown: number;
  isCounting: boolean;
  smsSending: boolean;
  submitting: boolean;
  submitIcon: ReactNode;
  submitText: string;
  onSendCode: (phoneNumber: string | undefined) => void | Promise<void>;
  onSubmit: (values: SmsLoginValues) => void | Promise<void>;
};

export function SmsLoginForm({
  countdown,
  isCounting,
  smsSending,
  submitting,
  submitIcon,
  submitText,
  onSendCode,
  onSubmit,
}: SmsLoginFormProps) {
  const [form] = Form.useForm<SmsLoginValues>();

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      requiredMark={false}
    >
      <Form.Item
        label="手机号"
        name="phoneNumber"
        rules={[
          { required: true, message: '请输入手机号' },
          {
            pattern: /^1\d{10}$/,
            message: '请输入正确的手机号',
          },
        ]}
      >
        <Input
          size="large"
          placeholder="请输入手机号"
          prefix={<MobileOutlined />}
        />
      </Form.Item>
      <Form.Item
        label="验证码"
        name="code"
        rules={[{ required: true, message: '请输入验证码' }]}
      >
        <VerificationCodeInput
          placeholder="验证码"
          prefix={<LockOutlined />}
          buttonDisabled={isCounting || smsSending}
          buttonText={
            smsSending
              ? '发送中'
              : countdown <= 0
                ? '获取验证码'
                : `${countdown} s`
          }
          onSendCode={() => {
            void onSendCode(form.getFieldValue('phoneNumber'));
          }}
        />
      </Form.Item>
      <Button
        className="login-submit"
        type="primary"
        size="large"
        htmlType="submit"
        icon={submitIcon}
        loading={submitting}
      >
        {submitText}
      </Button>
    </Form>
  );
}
