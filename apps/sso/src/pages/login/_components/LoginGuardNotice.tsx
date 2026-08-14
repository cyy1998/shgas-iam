import {
  LoadingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { Button } from 'antd';
import type { LoginPageGuardStatus } from '../_hooks/useLoginPageGuard';

export function LoginGuardNotice({
  status,
  onRetry,
}: {
  status: Exclude<LoginPageGuardStatus, 'login' | 'unsafe'>;
  onRetry: () => void;
}) {
  const pending = status === 'checking' || status === 'continuing';
  const description = status === 'invalid_request'
    ? '登录请求已失效，请返回应用重新发起登录'
    : status === 'unavailable'
      ? '统一身份认证服务暂时不可用，请稍后重试'
      : status === 'continuing'
        ? '登录状态有效，正在继续访问应用…'
        : '正在检查登录状态…';

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
        <div className="tip-card" aria-live="polite">
          <div className="tip-icon">
            {pending ? <LoadingOutlined spin /> : <SafetyCertificateOutlined />}
          </div>
          <div className="tip-title">
            {pending ? '身份状态检查' : '暂时无法继续登录'}
          </div>
          <div className="tip-desc">{description}</div>
          {status === 'unavailable' && (
            <Button type="primary" onClick={onRetry}>重试</Button>
          )}
        </div>
      </div>
    </div>
  );
}
