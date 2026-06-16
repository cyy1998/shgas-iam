import { buildGrafanaOverviewUrl } from '@admin/lib/grafana';
import { ExportOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { useEffect } from 'react';

export default function SystemLogsPage() {
  const grafanaUrl = buildGrafanaOverviewUrl();

  useEffect(() => {
    if (grafanaUrl) {
      window.location.assign(grafanaUrl);
    }
  }, [grafanaUrl]);

  return (
    <Result
      status={grafanaUrl ? 'info' : 'warning'}
      title={grafanaUrl ? '正在打开 Grafana' : 'Grafana 未配置'}
      extra={
        grafanaUrl ? (
          <Button
            icon={<ExportOutlined />}
            href={grafanaUrl}
            target="_blank"
            rel="noreferrer"
            type="primary"
          >
            打开 Grafana
          </Button>
        ) : null
      }
    />
  );
}
