import { codeVerify, passwordReset, sendMessage, usersUserInfo } from '@/services/open';
import { confirmPasswordRule, passwordRule } from '@/utils/form-check';
import { getQuery } from '@/utils/url';
import { history } from '@umijs/max';
import { Button, Form, Input, Modal, Select, Spin, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import './index.less';

function StepBar({ current }: { current: 0 | 1 | 2 }) {
  return (
    <div className="step-bar">
      <div className="step-item step-1-active">确认账号</div>
      <div
        className={`step-item ${current >= 1 ? 'step-2-active' : 'step-2-inactive'}`}
      >
        安全验证
      </div>
      <div
        className={`step-item ${current >= 2 ? 'step-3-active' : 'step-3-inactive'}`}
      >
        设置密码
      </div>
    </div>
  );
}

type Step1 = { type: '用户名'; username: string };
type Step2 = { phoneNumber: string; code: string };
type Step3 = { newPassword: string; newPasswordCopy: string };

export default function ResetPasswordPage() {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [mobileOptions, setMobileOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [form1] = Form.useForm<Step1>();
  const [form2] = Form.useForm<Step2>();
  const [form3] = Form.useForm<Step3>();

  useEffect(() => {
    const username = getQuery('username');
    if (username) form1.setFieldValue('username', username);
  }, [form1]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      if (current === 0) {
        const v = await form1.validateFields();
        const data = await usersUserInfo({ username: v.username });
        if (data.mobile) {
          setMobileOptions([
            { label: `手机号：${data.mobile}`, value: data.mobile },
          ]);
          form2.setFieldValue('phoneNumber', data.mobile);
        } else {
          setMobileOptions([
            { label: '手机号：暂未绑定手机号', value: '暂未绑定手机号' },
          ]);
          form2.setFieldValue('phoneNumber', '暂未绑定手机号');
        }
        setCurrent(1);
        return;
      }
      if (current === 1) {
        const v = await form2.validateFields();
        if (v.phoneNumber === '暂未绑定手机号') {
          message.warning('请先绑定手机号！');
          return;
        }
        await codeVerify({
          phoneNumber: v.phoneNumber,
          usage: 'login',
          code: v.code,
        });
        setCurrent(2);
        return;
      }
      if (current === 2) {
        const v = await form3.validateFields();
        await passwordReset({
          username: form1.getFieldValue('username'),
          phoneNumber: form2.getFieldValue('phoneNumber'),
          code: form2.getFieldValue('code'),
          newPassword: v.newPassword,
        });
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrev = () => {
    if (current === 1) setCurrent(0);
    else if (current === 2) {
      setCurrent(1);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdown(0);
    }
  };

  const sendCode = async () => {
    const phoneNumber = form2.getFieldValue('phoneNumber');
    if (phoneNumber === '暂未绑定手机号') {
      message.warning('请先绑定手机号！');
      return;
    }
    if (countdown > 0) return;
    setLoading(true);
    try {
      await sendMessage({ phoneNumber, usage: 'login' });
      startCountdown();
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => {
    const usp = new URLSearchParams(window.location.search);
    usp.delete('username');
    history.push(`/login?${usp.toString()}`);
  };

  return (
    <div className="reset-page">
      <Spin spinning={loading}>
        <div className="reset-card">
          <StepBar current={current as 0 | 1 | 2} />

          <div className="reset-form">
            {current === 0 && (
              <Form
                form={form1}
                layout="vertical"
                initialValues={{ type: '用户名' }}
              >
                <Form.Item
                  label="请选择类型"
                  name="type"
                  rules={[{ required: true, message: '请选择类型' }]}
                >
                  <Select options={[{ label: '用户名', value: '用户名' }]} />
                </Form.Item>
                <Form.Item
                  label="用户名"
                  name="username"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input placeholder="请输入用户名" allowClear />
                </Form.Item>
              </Form>
            )}

            {current === 1 && (
              <Form form={form2} layout="vertical">
                <Form.Item
                  label="验证方式"
                  name="phoneNumber"
                  rules={[{ required: true, message: '请选择验证方式' }]}
                >
                  <Select options={mobileOptions} />
                </Form.Item>
                <Form.Item
                  label="验证码"
                  name="code"
                  rules={[{ required: true, message: '请输入验证码' }]}
                >
                  <Input
                    placeholder="请输入验证码"
                    addonAfter={
                      <Button
                        type="link"
                        disabled={countdown > 0}
                        onClick={sendCode}
                      >
                        {countdown <= 0 ? '获取验证码' : `${countdown} 秒后重新获取`}
                      </Button>
                    }
                  />
                </Form.Item>
              </Form>
            )}

            {current === 2 && (
              <Form form={form3} layout="vertical">
                <Form.Item
                  label="新密码"
                  name="newPassword"
                  rules={[passwordRule]}
                >
                  <Input.Password placeholder="请输入新密码" />
                </Form.Item>
                <Form.Item
                  label="确认新密码"
                  name="newPasswordCopy"
                  dependencies={['newPassword']}
                  rules={[
                    confirmPasswordRule(() =>
                      form3.getFieldValue('newPassword'),
                    ),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" />
                </Form.Item>
              </Form>
            )}
          </div>

          <div className="form-actions">
            {current > 0 && (
              <Button danger onClick={handlePrev}>
                上一步
              </Button>
            )}
            {current < 2 && (
              <Button type="primary" danger onClick={handleNext}>
                下一步
              </Button>
            )}
            {current === 2 && (
              <Button type="primary" danger onClick={handleNext}>
                确定
              </Button>
            )}
          </div>
        </div>
      </Spin>

      <Modal
        open={done}
        title="提示"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={
          <Button type="primary" danger onClick={goLogin}>
            去登录
          </Button>
        }
      >
        已完成密码重置，请点击下方按钮！
      </Modal>
    </div>
  );
}
