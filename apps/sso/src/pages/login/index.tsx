import {
  CheckCircleOutlined,
  LockOutlined,
  LoginOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import logo from '@sso/assets/logo.png';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { withHumanVerification } from '@sso/lib/human-verification';
import { buildAuthorizeUrl } from '@sso/lib/sso';
import { login, mobileLogin } from '@sso/services/auth';
import { sendMessage } from '@sso/services/open';
import { mobileSet } from '@sso/services/public';
import { ServiceError } from '@sso/utils/request';
import { ApiErrorCode } from '@iam/contracts';
import { decodeRedirect, getQuery } from '@sso/utils/url';
import { history, useModel } from '@umijs/max';
import { Button, Form, Input, Modal, Tabs, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import './index.less';

type LoginMode = 'PWD' | 'SMS' | 'BMN';

export default function LoginPage() {
  const { authConfig } = useModel('sso');
  const [mode, setMode] = useState<LoginMode>('PWD');
  const [submitting, setSubmitting] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pwdForm] = Form.useForm();
  const [smsForm] = Form.useForm();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showLoginFailureModal = (msg: string) => {
    Modal.error({
      centered: true,
      title: '登录失败',
      content: msg,
      okText: '确定',
    });
  };

  const client = getQuery('client');
  const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';
  const clientLabel = client === 'iam-admin' ? 'IAM Admin' : client || 'SSO';

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
      const body = {
        username: values.username.trim(),
        password: values.password.trim(),
      };
      const data = await withHumanVerification(
        'passwordLogin',
        () => login(body, { suppressErrorMessage: true }),
        (capToken) => login({ ...body, capToken }, { suppressErrorMessage: true }),
      );
      if (!data.isMobileSet) {
        setMode('BMN');
        smsForm.resetFields();
        return;
      }
      redirectToAuthorize();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
      if (
        e.code === ApiErrorCode.LoginFailed ||
        e.code === ApiErrorCode.InvalidLoginCredential
      ) {
        showLoginFailureModal(e.message);
      } else {
        message.error(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmsLogin = async () => {
    const values = await smsForm.validateFields();
    setSubmitting(true);
    try {
      const body = {
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      };
      await withHumanVerification(
        'mobileLogin',
        () => mobileLogin(body, { suppressErrorMessage: true }),
        (capToken) => mobileLogin({ ...body, capToken }, { suppressErrorMessage: true }),
      );
      redirectToAuthorize();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
      if (
        e.code === ApiErrorCode.InvalidVerificationCode ||
        e.code === ApiErrorCode.LoginFailed ||
        e.code === ApiErrorCode.InvalidLoginCredential
      ) {
        showLoginFailureModal(e.message);
      } else {
        message.error(e.message);
      }
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
    if (submitting) return;
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
      setSmsSending(true);
      const body = {
        phoneNumber: phoneNumber.trim(),
        usage: mode === 'BMN' ? 'bindPhone' : 'login',
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
      setSmsSending(false);
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
        <div className="login-shell">
          <section className="brand-panel" aria-label="上海燃气身份认证平台">
            <div className="brand-top">
              <img src={logoColorfulTextWhite} alt="上海燃气" />
              <span>SHANGHAI GAS IAM</span>
            </div>
            <div className="brand-copy">
              <div className="brand-kicker">Unified Access</div>
              <h1>统一身份认证</h1>
              <p>面向业务系统的安全访问入口</p>
            </div>
          </section>

          <div className="tip-card">
            <div className="tip-icon">
              <SafetyCertificateOutlined />
            </div>
            <div className="tip-title">登录地址校验未通过</div>
            <div className="tip-desc">
              您使用的登录地址存在安全风险，请在浏览器中重新输入应用系统地址进行登录。
            </div>
            {tipBlock && (
              <>
                <div className="tip-link-label">例如</div>
                <div className="tip-link">{tipBlock}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="brand-panel" aria-label="上海燃气身份认证平台">
          <div className="brand-top">
            <img src={logoColorfulTextWhite} alt="上海燃气" />
            <span>SHANGHAI GAS IAM</span>
          </div>

          <div className="brand-copy">
            <div className="brand-kicker">Enterprise SSO</div>
            <h1>统一身份认证</h1>
            <p>面向员工与业务系统的安全访问入口</p>
          </div>

          <div className="trust-strip">
            <div className="trust-item">
              <SafetyCertificateOutlined />
              <span>组织级安全</span>
            </div>
            <div className="trust-item">
              <CheckCircleOutlined />
              <span>集中授权</span>
            </div>
            <div className="trust-item">
              <MobileOutlined />
              <span>多方式认证</span>
            </div>
          </div>
        </section>

        <div className="login-card">
          <div className="client-badge">
            <SafetyCertificateOutlined />
            <span>{clientLabel}</span>
          </div>

          <div className="login-header">
            <img src={logo} alt="上海燃气" />
            <div>
              <div className="title-zh">欢迎登录</div>
              <div className="title-en">上海燃气身份认证平台</div>
            </div>
          </div>

          {mode === 'BMN' && (
            <div className="bmn-tip">
              您的账号尚未绑定手机号，为保障账户安全并及时接收重要通知，建议先完成绑定。
            </div>
          )}

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
                  prefix={<UserOutlined />}
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
                  prefix={<LockOutlined />}
                  onPressEnter={handleSubmit}
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
                  prefix={<MobileOutlined />}
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
                  prefix={<LockOutlined />}
                  onPressEnter={handleSubmit}
                  addonAfter={
                    <button
                      className="sms-code-btn"
                      type="button"
                      disabled={countdown > 0 || smsSending}
                      onClick={sendSms}
                    >
                      {smsSending
                        ? '校验中'
                        : countdown <= 0
                          ? '获取验证码'
                          : `${countdown} s`}
                    </button>
                  }
                />
              </Form.Item>
            </Form>
          )}

          <Button
            className="login-submit"
            type="primary"
            size="large"
            icon={mode === 'BMN' ? <MobileOutlined /> : <LoginOutlined />}
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

          <div className="login-footnote">
            <LockOutlined />
            <span>受保护的组织访问</span>
          </div>
        </div>
      </div>
    </div>
  );
}
