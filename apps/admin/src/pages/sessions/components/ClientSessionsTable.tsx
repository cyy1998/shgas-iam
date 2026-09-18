import {
  listSessions,
  SessionListError,
  SessionListErrorKind,
  type SessionListItem,
} from '@admin/services/session-management';
import { type ActionType, ProTable } from '@ant-design/pro-components';
import { Alert, Button, Space } from 'antd';
import { type RefObject, useEffect, useRef, useState } from 'react';

type ClientSessionsTableProps = {
  userSessionId: string;
  actionRef: RefObject<ActionType | undefined>;
  revokingTarget: string | null;
  hasUnfinished: boolean;
  canRevoke: boolean;
  onRevoke: (session: SessionListItem) => void;
  beginCapabilityRead: () => (allowed: boolean) => void;
};

export default function ClientSessionsTable(props: ClientSessionsTableProps) {
  const [rows, setRows] = useState<SessionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canRevoke, setCanRevoke] = useState(false);
  const requestSequenceRef = useRef(0);
  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    [],
  );

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {error ? <Alert showIcon type="error" title={error} /> : null}
      <ProTable<SessionListItem>
        actionRef={props.actionRef}
        rowKey={(session) =>
          session.record?.identity.id ?? session.principalSessionId
        }
        headerTitle="应用会话"
        search={false}
        options={false}
        dataSource={rows}
        scroll={{ x: 720 }}
        pagination={{ defaultPageSize: 20, pageSizeOptions: [20, 50, 100] }}
        locale={{ emptyText: error ? '加载失败' : '暂无应用会话' }}
        columns={[
          {
            title: '应用',
            key: 'client',
            render: (_, row) => row.record?.clientId,
          },
          {
            title: '协议',
            key: 'protocol',
            width: 120,
            render: (_, row) =>
              row.record?.protocol === 'oidc' ? 'OIDC' : 'Custom SSO',
          },
          {
            title: '授权时间',
            dataIndex: 'authTime',
            width: 180,
            render: (_, row) => new Date(row.authTime).toLocaleString(),
          },
          {
            title: '过期时间',
            dataIndex: 'expiresAt',
            width: 180,
            render: (_, row) => new Date(row.expiresAt).toLocaleString(),
          },
          {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 140,
            render: (_, row) => (
              <Button
                type="link"
                size="small"
                style={{ paddingInline: 0, fontWeight: 500 }}
                danger
                disabled={
                  !canRevoke ||
                  !props.canRevoke ||
                  !row.record ||
                  props.revokingTarget !== null ||
                  props.hasUnfinished
                }
                loading={
                  props.revokingTarget === `session:${row.record?.identity.id}`
                }
                onClick={() => props.onRevoke(row)}
              >
                下线应用会话
              </Button>
            ),
          },
        ]}
        request={async ({ current = 1, pageSize = 20 }) => {
          const sequence = ++requestSequenceRef.current;
          const updateCapability = props.beginCapabilityRead();
          try {
            const response = await listSessions({
              conditions: {
                kind: 'clientSession',
                userSessionId: props.userSessionId,
              },
              pageNum: current,
              pageSize,
            });
            if (sequence !== requestSequenceRef.current)
              return { data: [], total: 0, success: false };
            setRows(response.result);
            setError(null);
            const allowed = response.allowedActions?.revoke === true;
            setCanRevoke(allowed);
            updateCapability(allowed);
            return {
              data: response.result,
              total: response.total,
              success: true,
            };
          } catch (cause) {
            if (sequence !== requestSequenceRef.current)
              return { data: [], total: 0, success: false };
            setRows([]);
            setCanRevoke(false);
            updateCapability(false);
            setError(
              cause instanceof SessionListError &&
                cause.kind === SessionListErrorKind.LoginStateUnavailable
                ? '登录状态服务暂时不可用'
                : '应用会话加载失败',
            );
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() => [
          <Button
            key="refresh"
            onClick={() => props.actionRef.current?.reload()}
          >
            刷新应用会话
          </Button>,
        ]}
      />
    </Space>
  );
}
