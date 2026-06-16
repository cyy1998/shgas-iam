import type { AuditLogVo } from '@admin/services/audit';
import { buildAuditLogGrafanaUrl } from '@admin/lib/grafana';
import { ExportOutlined } from '@ant-design/icons';
import { Button, Descriptions, Divider, Drawer, Space, Tag, Typography } from 'antd';
import {
  getActionLabel,
  getActorDisplay,
  getTargetDisplay,
  outcomeLabels,
} from './auditLogDisplay';

function formatDate(value: AuditLogVo['eventTime']) {
  return value ? new Date(value).toLocaleString() : '—';
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function getErrorSummary(details: Record<string, unknown>) {
  const code = details.errorCode;
  const message = details.errorMessage ?? details.message;
  if (!code && !message) return '—';
  return [code, message].filter(Boolean).join(' / ');
}

type Props = {
  open: boolean;
  auditLog: AuditLogVo | null;
  onClose: () => void;
};

export default function AuditLogDetailDrawer({
  open,
  auditLog,
  onClose,
}: Props) {
  const details = (auditLog?.details ?? {}) as Record<string, unknown>;
  const actor = auditLog ? getActorDisplay(auditLog) : null;
  const target = auditLog ? getTargetDisplay(auditLog) : null;
  const grafanaUrl = auditLog
    ? buildAuditLogGrafanaUrl({
        requestId: auditLog.requestId,
        traceId: auditLog.traceId,
        sourceApp: auditLog.sourceApp,
        eventTime: auditLog.eventTime,
      })
    : null;

  return (
    <Drawer
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
      title="审计日志详情"
      extra={
        grafanaUrl ? (
          <Button
            icon={<ExportOutlined />}
            href={grafanaUrl}
            target="_blank"
            rel="noreferrer"
          >
            系统日志
          </Button>
        ) : null
      }
    >
      {!auditLog ? null : (
        <>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="时间">
              {formatDate(auditLog.eventTime)}
            </Descriptions.Item>
            <Descriptions.Item label="结果">
              <Tag color={auditLog.outcome === 'success' ? 'green' : 'red'}>
                {outcomeLabels[auditLog.outcome] ?? auditLog.outcome}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Action" span={2}>
              <Space direction="vertical" size={0}>
                <Typography.Text>
                  {getActionLabel(auditLog.action)}
                </Typography.Text>
                <Typography.Text code copyable type="secondary">
                  {auditLog.action}
                </Typography.Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="操作者">
              {actor ? (
                <Space size={6} wrap>
                  <Tag>{actor.typeLabel}</Tag>
                  <Space direction="vertical" size={0}>
                    <Typography.Text>
                      {actor.name ?? actor.code}
                    </Typography.Text>
                    {actor.name && actor.code !== actor.name ? (
                      <Typography.Text type="secondary">
                        {actor.code}
                      </Typography.Text>
                    ) : null}
                  </Space>
                </Space>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="目标对象">
              {target ? (
                <Space size={6} wrap>
                  <Tag>{target.typeLabel}</Tag>
                  <Space direction="vertical" size={0}>
                    <Typography.Text>
                      {target.name ?? target.code}
                    </Typography.Text>
                    {target.name && target.code !== target.name ? (
                      <Typography.Text type="secondary">
                        {target.code}
                      </Typography.Text>
                    ) : null}
                  </Space>
                </Space>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="来源应用">
              {auditLog.sourceApp}
            </Descriptions.Item>
            <Descriptions.Item label="IP">
              {auditLog.ip ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Request ID">
              {auditLog.requestId ? (
                <Typography.Text code copyable>
                  {auditLog.requestId}
                </Typography.Text>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Trace ID">
              {auditLog.traceId ? (
                <Typography.Text code copyable>
                  {auditLog.traceId}
                </Typography.Text>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="路由">
              {auditLog.route ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="方法">
              {auditLog.method ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="User Agent" span={2}>
              <Typography.Text style={{ wordBreak: 'break-all' }}>
                {auditLog.userAgent ?? '—'}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="错误摘要" span={2}>
              {getErrorSummary(details)}
            </Descriptions.Item>
          </Descriptions>

          <Divider orientation="left">Details</Divider>
          <Typography.Paragraph
            style={{
              background: '#f6f8fa',
              borderRadius: 8,
              marginBottom: 0,
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <Typography.Text code>{stringifyJson(details)}</Typography.Text>
          </Typography.Paragraph>
        </>
      )}
    </Drawer>
  );
}
