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
      <div className="maintenance-card">
        <div className="maintenance-tip-bar" />
        <Spin spinning={loading}>
          <div className="maintenance-title">系统维护中</div>
          <Button
            type="primary"
            size="large"
            onClick={handleRetry}
            style={{ background: '#e6a23c', borderColor: '#e6a23c' }}
          >
            刷新重试
          </Button>
        </Spin>
      </div>
    </div>
  );
}
