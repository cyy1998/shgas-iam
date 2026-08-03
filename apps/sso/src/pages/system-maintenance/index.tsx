import { ReloadOutlined, ToolOutlined } from '@ant-design/icons';
import { ClientStatus } from '@iam/contracts';
import logoColorfulTextWhite from '@sso/assets/logo-colorful-text-white.png';
import { clientStatus } from '@sso/services/open';
import { getQuery } from '@sso/utils/url';
import { Button, message, Spin } from 'antd';
import { useState } from 'react';
import './index.less';

export default function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    const clientCode = getQuery('client')?.trim();
    if (!clientCode) {
      message.warning('缺少应用上下文，请从业务系统重新发起登录。');
      return;
    }

    setLoading(true);
    try {
      const data = await clientStatus({ clientCode });
      if (!data || data.status !== ClientStatus.Maintenance) {
        const redirectUrl = getQuery('redirectUrl');
        if (redirectUrl) {
          window.location.href = redirectUrl;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-shell">
        <section className="maintenance-hero" aria-label="业务系统维护中">
          <div className="brand-top">
            <img src={logoColorfulTextWhite} alt="上海燃气" />
            <span>SHANGHAI GAS IAM</span>
          </div>

          <div className="hero-copy">
            <h1>业务系统维护中</h1>
          </div>
        </section>

        <Spin spinning={loading}>
          <div className="maintenance-card">
            <div className="status-icon">
              <ToolOutlined />
            </div>
            <div className="maintenance-title">业务系统维护中</div>
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
