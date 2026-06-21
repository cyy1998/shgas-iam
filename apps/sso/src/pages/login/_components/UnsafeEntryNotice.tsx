import { SafetyCertificateOutlined } from '@ant-design/icons';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { useMemo } from 'react';

function getTipBlock(origin: string) {
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
}

export function UnsafeEntryNotice() {
  const tipBlock = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getTipBlock(window.location.origin);
  }, []);

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
