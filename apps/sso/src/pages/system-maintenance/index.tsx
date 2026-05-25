import {
  ReloadOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { clientStatus } from '@sso/services/open';
import { decodeRedirect, getQuery } from '@sso/utils/url';
import { Button, Spin } from 'antd';
import { useState } from 'react';
import './index.less';

export default function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    setLoading(true);
    try {
      const data = await clientStatus({ clientCode: 'tender' });
      if (data.status !== 2) {
        const redirectUrl = decodeRedirect(getQuery('redirectUrl'));
        if (redirectUrl) {
          window.location.href = redirectUrl;
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-shell">
        <section className="maintenance-hero" aria-label="系统维护">
          <div className="brand-top">
            <img src={logoColorfulTextWhite} alt="上海燃气" />
            <span>SHANGHAI GAS IAM</span>
          </div>

          <div className="hero-copy">
            <div className="hero-kicker">Service Notice</div>
            <h1>系统维护中</h1>
            <p>统一身份认证服务正在进行维护，完成后将恢复业务系统访问。</p>
          </div>

          <div className="security-note">
            <SafetyCertificateOutlined />
            <span>维护期间请勿重复提交登录请求，稍后可刷新重试。</span>
          </div>
        </section>

        <Spin spinning={loading}>
          <div className="maintenance-card">
            <div className="status-icon">
              <ToolOutlined />
            </div>
            <div className="maintenance-title">系统维护中</div>
            <div className="maintenance-desc">
              当前服务暂不可用，请稍后刷新重试。
            </div>
            <Button
              className="maintenance-submit"
              icon={<ReloadOutlined />}
              type="primary"
              size="large"
              onClick={handleRetry}
            >
              刷新重试
            </Button>
          </div>
        </Spin>
      </div>
    </div>
  );
}
