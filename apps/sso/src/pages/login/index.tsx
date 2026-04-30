import logo from '@/assets/logo.png';
import { buildAuthorizeUrl } from '@/lib/sso';
import { login, mobileLogin } from '@/services/auth';
import { sendMessage } from '@/services/open';
import { mobileSet } from '@/services/public';
import { ServiceError } from '@/utils/request';
import { decodeRedirect, getQuery } from '@/utils/url';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Button, Form, Input, Tabs, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import './index.less';

type LoginMode = 'PWD' | 'SMS' | 'BMN';

export default function LoginPage() {
  const { authConfig } = useModel('sso');
  const [mode, setMode] = useState<LoginMode>('PWD');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pwdForm] = Form.useForm();
  const [smsForm] = Form.useForm();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = getQuery('client');
  const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';

  useEffect(() => {
    const loginType = getQuery('loginType');
    if (loginType === 'SMS' || loginType === 'PWD') setMode(loginType);
  }, []);

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

  const redirectToAuthorize = () => {
    if (!authConfig || !client) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildAuthorizeUrl(authConfig, redirectUrl, client);
  };

  const handlePwdLogin = async () => {
    const values = await pwdForm.validateFields();
    setSubmitting(true);
    try {
      const data = await login({
        username: values.username.trim(),
        password: values.password.trim(),
      });
      if (!data.isMobileSet) {
        setMode('BMN');
        smsForm.resetFields();
        return;
      }
      redirectToAuthorize();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmsLogin = async () => {
    const values = await smsForm.validateFields();
    setSubmitting(true);
    try {
      await mobileLogin({
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      });
      redirectToAuthorize();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleBindMobile = async () => {
    const values = await smsForm.validateFields();
    setSubmitting(true);
    try {
      await mobileSet({
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      });
      redirectToAuthorize();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'PWD') return handlePwdLogin();
    if (mode === 'SMS') return handleSmsLogin();
    return handleBindMobile();
  };

  const sendSms = async () => {
    if (countdown > 0) return;
    const phoneNumber = smsForm.getFieldValue('phoneNumber');
    if (!phoneNumber || !/^1\d{10}$/.test(phoneNumber)) {
      message.error('请填写正确的手机号');
      return;
    }
    try {
      await sendMessage({
        phoneNumber: phoneNumber.trim(),
        usage: mode === 'BMN' ? 'bindPhone' : 'login',
      });
      startCountdown();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    }
  };

  const tipBlock = useMemo(() => {
    const origin = window.location.origin;
    if (origin === 'http://176.169.99.150') {
      return (
        <>
          <div>上海燃气采招平台：</div>
          <div>http://176.169.99.150/tender/</div>
        </>
      );
    }
    if (origin === 'http://app.shgas.com') {
      return (
        <>
          <div>上海燃气数据服务平台：</div>
          <div>http://app.shgas.com/data-platform</div>
          <div className="tip-link">上海燃气采招平台：</div>
          <div>http://app.shgas.com/tender/</div>
        </>
      );
    }
    if (origin === 'https://tender.shgas.com.cn') {
      return (
        <>
          <div>上海燃气采招平台：</div>
          <div>https://tender.shgas.com.cn/tender/</div>
        </>
      );
    }
    return null;
  }, []);

  if (!client) {
    return (
      <div className="login-page">
        <div className="tip-card">
          <div className="tip-bar" />
          <div className="tip-title">提示：</div>
          <div className="tip-title">
            您使用的登录地址存在安全风险，请在浏览器中重新输入应用系统地址进行登录。
          </div>
          {tipBlock && (
            <>
              <div className="tip-link">例如：</div>
              <div className="tip-link">{tipBlock}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src={logo} alt="logo" />
          <div className="title-zh">上海燃气</div>
          <div className="title-en">SHANGHAI GAS</div>
          {mode === 'BMN' && (
            <div className="bmn-tip">
              您的账号尚未绑定手机号，为保障账户安全并及时接收重要通知，强烈建议您立即绑定手机号。
            </div>
          )}
        </div>

        {mode !== 'BMN' && (
          <Tabs
            activeKey={mode}
            onChange={(k) => setMode(k as LoginMode)}
            centered
            items={[
              { key: 'PWD', label: '密码登录' },
              { key: 'SMS', label: '手机登录' },
            ]}
          />
        )}

        {mode === 'PWD' && (
          <Form
            form={pwdForm}
            layout="vertical"
            onFinish={handleSubmit}
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
                prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
              />
            </Form.Item>
            <div className="login-actions">
              <span className="login-actions-label">登录密码</span>
              <span
                className="forgot-link"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search);
                  const username = pwdForm.getFieldValue('username');
                  if (username) params.set('username', username);
                  history.push(`/reset-password?${params.toString()}`);
                }}
              >
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
                prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
              />
            </Form.Item>
          </Form>
        )}

        {(mode === 'SMS' || mode === 'BMN') && (
          <Form
            form={smsForm}
            layout="vertical"
            onFinish={handleSubmit}
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
                prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
              />
            </Form.Item>
            <Form.Item
              label="验证码"
              name="code"
              rules={[{ required: true, message: '请输入验证码' }]}
            >
              <Input
                size="large"
                placeholder="验证码"
                prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
                addonAfter={
                  <span style={{ cursor: 'pointer' }} onClick={sendSms}>
                    {countdown <= 0 ? '获取验证码' : `${countdown} s`}
                  </span>
                }
              />
            </Form.Item>
          </Form>
        )}

        <Button
          className="login-submit"
          type="primary"
          size="large"
          loading={submitting}
          onClick={handleSubmit}
        >
          {mode === 'BMN' ? '绑定手机号' : '安全登录'}
        </Button>

        {mode === 'BMN' && (
          <Button
            className="skip-btn"
            type="link"
            onClick={redirectToAuthorize}
          >
            跳过
          </Button>
        )}
      </div>
    </div>
  );
}
