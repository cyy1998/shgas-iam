import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  KeyOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { withHumanVerification } from '@sso/lib/human-verification';
import {
  codeVerify,
  passwordReset,
  sendMessage,
  usersUserInfo,
} from '@sso/services/open';
import { confirmPasswordRule, passwordRule } from '@sso/utils/form-check';
import { ServiceError } from '@sso/utils/request';
import { getQuery } from '@sso/utils/url';
import { history } from '@umijs/max';
import { Button, Form, Input, Modal, Select, Spin, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import './index.less';

function StepBar({ current }: { current: 0 | 1 | 2 }) {
  const steps = [
    {
      title: '确认账号',
      desc: '识别您的身份',
      icon: <UserOutlined />,
    },
    {
      title: '安全验证',
      desc: '校验绑定手机',
      icon: <MobileOutlined />,
    },
    {
      title: '设置密码',
      desc: '更新登录凭证',
      icon: <KeyOutlined />,
    },
  ];

  return (
    <div className="step-bar">
      {steps.map((step, index) => {
        const isDone = current > index;
        const isActive = current === index;
        return (
          <div
            className={`step-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
            key={step.title}
          >
            <div className="step-index">
              {isDone ? <CheckCircleOutlined /> : step.icon}
            </div>
            <div>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          </div>
        );
      })}
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
        const body = { username: v.username };
        const data = await withHumanVerification(
          'openUserInfoLookup',
          () => usersUserInfo(body),
          (capToken) => usersUserInfo({ ...body, capToken }),
        );
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
        const verification = await codeVerify({
          username: form1.getFieldValue('username'),
          phoneNumber: v.phoneNumber,
          usage: 'resetPassword',
          code: v.code,
        });
        if (!verification.result) {
          message.error('验证码错误');
          return;
        }
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
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
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
      const body = {
        username: form1.getFieldValue('username'),
        phoneNumber,
        usage: 'resetPassword',
      } as const;
      await withHumanVerification(
        'sendSmsCode',
        () => sendMessage(body),
        (capToken) => sendMessage({ ...body, capToken }),
      );
      startCountdown();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => {
    const usp = new URLSearchParams(window.location.search);
    usp.delete('username');
    const query = usp.toString();
    history.push(query ? `/login?${query}` : '/login');
  };

  return (
    <div className="reset-page">
      <div className="reset-shell">
        <section className="reset-hero" aria-label="密码安全">
          <div className="brand-top">
            <img src={logoColorfulTextWhite} alt="上海燃气" />
            <span>SHANGHAI GAS IAM</span>
          </div>
          <div className="hero-copy">
            <div className="hero-kicker">Account Recovery</div>
            <h1>重置登录密码</h1>
            <p>通过已绑定手机号完成身份校验，安全恢复您的统一身份账号访问。</p>
          </div>
          <div className="security-note">
            <SafetyCertificateOutlined />
            <span>密码重置完成后，请使用新密码重新登录相关业务系统。</span>
          </div>
        </section>

        <Spin spinning={loading}>
          <div className="reset-card">
            <div className="reset-card-header">
              <div>
                <div className="reset-title">找回密码</div>
                <div className="reset-subtitle">
                  按步骤完成账号验证与密码更新
                </div>
              </div>
              <div className="reset-header-actions">
                <Button
                  className="reset-back-login"
                  icon={<ArrowLeftOutlined />}
                  onClick={goLogin}
                  type="text"
                >
                  返回登录
                </Button>
                <div className="reset-badge">
                  <LockOutlined />
                  <span>安全流程</span>
                </div>
              </div>
            </div>

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
                    <Select
                      size="large"
                      options={[{ label: '用户名', value: '用户名' }]}
                    />
                  </Form.Item>
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      size="large"
                      placeholder="请输入用户名"
                      prefix={<UserOutlined />}
                      allowClear
                    />
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
                    <Select size="large" options={mobileOptions} />
                  </Form.Item>
                  <Form.Item
                    label="验证码"
                    name="code"
                    rules={[{ required: true, message: '请输入验证码' }]}
                  >
                    <Input
                      size="large"
                      placeholder="请输入验证码"
                      prefix={<LockOutlined />}
                      addonAfter={
                        <button
                          className="reset-code-btn"
                          type="button"
                          disabled={countdown > 0}
                          onClick={sendCode}
                        >
                          {countdown <= 0
                            ? '获取验证码'
                            : `${countdown} 秒后重试`}
                        </button>
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
                    <Input.Password
                      size="large"
                      placeholder="请输入新密码"
                      prefix={<LockOutlined />}
                    />
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
                    <Input.Password
                      size="large"
                      placeholder="请再次输入新密码"
                      prefix={<LockOutlined />}
                    />
                  </Form.Item>
                </Form>
              )}
            </div>

            <div className="form-actions">
              {current > 0 && (
                <Button size="large" onClick={handlePrev}>
                  上一步
                </Button>
              )}
              {current < 2 && (
                <Button type="primary" size="large" onClick={handleNext}>
                  下一步
                </Button>
              )}
              {current === 2 && (
                <Button type="primary" size="large" onClick={handleNext}>
                  确定
                </Button>
              )}
            </div>
          </div>
        </Spin>
      </div>

      <Modal
        className="reset-done-modal"
        open={done}
        title="密码重置完成"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={
          <Button type="primary" onClick={goLogin}>
            去登录
          </Button>
        }
      >
        已完成密码重置，请使用新密码重新登录。
      </Modal>
    </div>
  );
}
