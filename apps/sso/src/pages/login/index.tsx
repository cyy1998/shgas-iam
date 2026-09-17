import {
  CheckCircleOutlined,
  LockOutlined,
  LoginOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { ApiErrorCode } from '@iam/contracts';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import logo from '@sso/assets/logo.png';
import { useSmsCodeCountdown } from '@sso/hooks/useSmsCodeCountdown';
import { withHumanVerification } from '@sso/lib/human-verification';
import { login, mobileLogin } from '@sso/services/auth';
import { sendMessage } from '@sso/services/open';
import { mobileSet } from '@sso/services/public';
import { ServiceError } from '@sso/utils/request';
import { history } from '@umijs/max';
import { Button, Form, Modal, Tabs, message } from 'antd';
import { useState } from 'react';
import { LoginGuardNotice } from './_components/LoginGuardNotice';
import {
  PasswordLoginForm,
  type PasswordLoginValues,
} from './_components/PasswordLoginForm';
import { SmsLoginForm, type SmsLoginValues } from './_components/SmsLoginForm';
import { UnsafeEntryNotice } from './_components/UnsafeEntryNotice';
import { useLoginPageGuard } from './_hooks/useLoginPageGuard';
import { useLoginRedirect } from './_hooks/useLoginRedirect';
import './index.less';

type LoginMode = 'PWD' | 'SMS' | 'BMN';

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>(() => {
    const loginType = new URLSearchParams(window.location.search).get(
      'loginType',
    );
    return loginType === 'SMS' || loginType === 'PWD' ? loginType : 'PWD';
  });
  const [submitting, setSubmitting] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [pwdForm] = Form.useForm<PasswordLoginValues>();
  const { countdown, isCounting, startCountdown, restoreCountdown } =
    useSmsCodeCountdown();
  const loginRedirect = useLoginRedirect();
  const {
    client,
    clientLabel,
    isContinuationReady,
    isUnsafeEntry,
    oidcReturn,
    redirectAfterLogin,
    redirectUrl,
    state,
    ssoReturn,
  } = loginRedirect;
  const loginGuard = useLoginPageGuard({
    client: client ?? '',
    isContinuationReady,
    isUnsafeEntry,
    oidcReturn,
    redirectAfterLogin,
    redirectUrl,
    state,
    ssoReturn,
  });

  const showLoginFailureModal = (msg: string) => {
    Modal.error({
      centered: true,
      title: '登录失败',
      content: msg,
      okText: '确定',
    });
  };

  const handleForgotPassword = () => {
    const params = new URLSearchParams(window.location.search);
    const username = pwdForm.getFieldValue('username');
    if (username) params.set('username', username);
    history.push(`/reset-password?${params.toString()}`);
  };

  const handlePwdLogin = async (values: PasswordLoginValues) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = {
        username: values.username.trim(),
        password: values.password.trim(),
      };
      const data = await withHumanVerification(
        'passwordLogin',
        () => login(body, { suppressErrorMessage: true }),
        (capToken) =>
          login({ ...body, capToken }, { suppressErrorMessage: true }),
      );
      if (!data.isMobileSet) {
        setMode('BMN');
        return;
      }
      redirectAfterLogin();
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

  const handleSmsLogin = async (values: SmsLoginValues) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = {
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      };
      await withHumanVerification(
        'mobileLogin',
        () => mobileLogin(body, { suppressErrorMessage: true }),
        (capToken) =>
          mobileLogin({ ...body, capToken }, { suppressErrorMessage: true }),
      );
      redirectAfterLogin();
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

  const handleBindMobile = async (values: SmsLoginValues) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await mobileSet({
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      });
      redirectAfterLogin();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmsSubmit = (values: SmsLoginValues) => {
    if (mode === 'SMS') return handleSmsLogin(values);
    return handleBindMobile(values);
  };

  const sendSms = async (phoneNumber?: string) => {
    if (isCounting) return;
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
      restoreCountdown(e);
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSmsSending(false);
    }
  };

  if (isUnsafeEntry) {
    return <UnsafeEntryNotice />;
  }

  if (loginGuard.status !== 'login') {
    return (
      <LoginGuardNotice
        status={
          loginGuard.status as Exclude<
            typeof loginGuard.status,
            'login' | 'unsafe'
          >
        }
        onRetry={loginGuard.retry}
      />
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
              onChange={(key) => setMode(key as LoginMode)}
              centered
              items={[
                { key: 'PWD', label: '密码登录' },
                { key: 'SMS', label: '手机登录' },
              ]}
            />
          )}

          {mode === 'PWD' && (
            <PasswordLoginForm
              form={pwdForm}
              submitting={submitting}
              onForgotPassword={handleForgotPassword}
              onSubmit={handlePwdLogin}
            />
          )}

          {(mode === 'SMS' || mode === 'BMN') && (
            <SmsLoginForm
              key={mode}
              countdown={countdown}
              isCounting={isCounting}
              smsSending={smsSending}
              submitting={submitting}
              submitIcon={
                mode === 'BMN' ? <MobileOutlined /> : <LoginOutlined />
              }
              submitText={mode === 'BMN' ? '绑定手机号' : '安全登录'}
              onSendCode={sendSms}
              onSubmit={handleSmsSubmit}
            />
          )}

          {mode === 'BMN' && (
            <Button
              className="skip-btn"
              type="link"
              onClick={redirectAfterLogin}
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
