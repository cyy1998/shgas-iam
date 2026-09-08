import LoginRestrictionsTab from '@admin/pages/sessions/LoginRestrictionsTab';
import UserSummary from '@admin/pages/sessions/components/UserSummary';
import { requestUserOptions } from '@admin/pages/sessions/session-selectors';
import {
  listSessions,
  revokeSessions,
  SessionListError,
  SessionListErrorKind,
  type SessionListErrorKindValue,
  type SessionListItem,
  SessionRevokeError,
  SessionRevokeErrorKind,
  type SessionRevokeInput,
} from '@admin/services/session-management';
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import {
  Alert,
  Button,
  message,
  Modal,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useRef, useState } from 'react';

const authMethodDisplay = {
  password: '密码',
  mobile: '手机验证码',
  oa: 'OA',
  wechat: '微信',
  unknown: '未知',
} as const;

const deviceTypeDisplay = {
  desktop: '桌面',
  mobile: '手机',
  tablet: '平板',
  unknown: '未知',
} as const;

const operatingSystemDisplay = {
  windows: 'Windows',
  macos: 'macOS',
  ios: 'iOS',
  android: 'Android',
  linux: 'Linux',
  unknown: '未知',
} as const;

const browserDisplay = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  wechat: '微信',
  other: '其他',
} as const;

const userRevokeSafetyGuidance =
  '操作开始时已索引的会话将被处理；操作期间或之后建立的新会话仍可能存在。IAM 不能保证第三方自行建立的本地会话退出。强制下线不会阻止未来重新登录；如怀疑凭据泄露，请同时执行密码重置、账号暂停或结束。';

function buildUserRevokeConfirmationContent(isCurrentUser: boolean) {
  const impact = isCurrentUser
    ? 'IAM 会保留当前管理端根会话，但仍会撤销该根会话关联的 IAM 凭证及本人的其他根 Principal Session。'
    : 'IAM 会撤销该用户全部 Principal Session 及其派生访问。';
  return `${impact}${userRevokeSafetyGuidance}`;
}

function renderOrigin(session: SessionListItem) {
  if (!session.origin) return '未知';
  const { origin } = session;
  return (
    <Space orientation="vertical" size={2}>
      <Typography.Text>{origin.ip ?? '未知 IP'}</Typography.Text>
      <Typography.Text type="secondary">
        {deviceTypeDisplay[origin.deviceType]} /{' '}
        {operatingSystemDisplay[origin.operatingSystem]} /{' '}
        {browserDisplay[origin.browser]}
      </Typography.Text>
    </Space>
  );
}

export default function SessionsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [loadError, setLoadError] = useState<SessionListErrorKindValue | null>(
    null,
  );
  const [sessionRows, setSessionRows] = useState<SessionListItem[]>([]);
  const [auditFailedAfterEffect, setAuditFailedAfterEffect] = useState(false);
  const [revokingTarget, setRevokingTarget] = useState<string | null>(null);

  const refreshSessions = () => {
    actionRef.current?.reload();
  };

  const executeRevoke = async (
    input: SessionRevokeInput,
    targetKey: string,
  ) => {
    let refreshAfterOperation = false;
    setRevokingTarget(targetKey);
    try {
      const result = await revokeSessions(input);
      refreshAfterOperation = true;
      if (!result.changed) {
        message.warning('目标已失效或已被处理');
      } else if (result.result.cleanup.failed > 0) {
        message.warning(
          `会话已下线，部分关联清理失败（${result.result.cleanup.failed} 项）`,
        );
      } else {
        message.success('会话已下线');
      }
    } catch (error) {
      if (
        error instanceof SessionRevokeError &&
        error.kind === SessionRevokeErrorKind.AuditFailedAfterEffect
      ) {
        refreshAfterOperation = true;
        setAuditFailedAfterEffect(true);
      } else if (
        error instanceof SessionRevokeError &&
        error.kind === SessionRevokeErrorKind.CurrentSessionProtected
      ) {
        message.error('当前管理会话受保护，未执行下线');
      } else if (
        error instanceof SessionRevokeError &&
        error.kind === SessionRevokeErrorKind.LoginStateUnavailable
      ) {
        message.error('登录状态服务暂时不可用');
      } else {
        message.error('会话下线失败');
      }
    } finally {
      setRevokingTarget(null);
      if (refreshAfterOperation) {
        window.setTimeout(refreshSessions, 0);
      }
    }
  };

  const confirmRevokeSession = (session: SessionListItem) => {
    Modal.confirm({
      title: '确认强制下线本次会话？',
      content:
        'IAM 会撤销此 Principal Session 及其派生访问，但不能保证第三方自行建立的本地会话退出。强制下线不会阻止未来重新登录；如怀疑凭据泄露，请同时执行密码重置、账号暂停或结束。',
      okText: '确认下线',
      okType: 'danger',
      cancelText: '取消',
      onOk: () =>
        executeRevoke(
          {
            target: {
              type: 'session',
              principalSessionId: session.principalSessionId,
            },
          },
          `session:${session.principalSessionId}`,
        ),
    });
  };

  const confirmRevokeUser = (session: SessionListItem) => {
    if (session.user.id === null) return;
    const targetUserId = session.user.id;

    Modal.confirm({
      title: '确认下线该用户全部会话？',
      content: buildUserRevokeConfirmationContent(session.isCurrentUser),
      okText: '确认下线',
      okType: 'danger',
      cancelText: '取消',
      onOk: () =>
        executeRevoke(
          {
            target: {
              type: 'user',
              userId: targetUserId,
            },
          },
          `user:${targetUserId}`,
        ),
    });
  };

  const columns: ProColumns<SessionListItem>[] = [
    {
      title: '用户',
      dataIndex: 'userId',
      hideInTable: true,
      valueType: 'select',
      request: requestUserOptions,
      fieldProps: {
        filterOption: false,
        placeholder: '输入工号或姓名搜索',
        showSearch: true,
      },
    },
    {
      title: '用户',
      key: 'user',
      width: 220,
      search: false,
      render: (_, session) => (
        <UserSummary
          accountStatus={session.user.accountStatus}
          id={session.user.id ?? session.user.subjectId}
          name={session.user.name}
          username={session.user.username}
        />
      ),
    },
    {
      title: '登录方式',
      dataIndex: 'authMethods',
      width: 150,
      search: false,
      render: (_, session) =>
        session.authMethods
          .map((method) => authMethodDisplay[method])
          .join('、'),
    },
    {
      title: '登录时间',
      dataIndex: 'authTime',
      width: 180,
      search: false,
      render: (_, session) => new Date(session.authTime).toLocaleString(),
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      width: 180,
      search: false,
      render: (_, session) => new Date(session.expiresAt).toLocaleString(),
    },
    {
      title: '登录来源',
      key: 'origin',
      width: 220,
      search: false,
      render: (_, session) => renderOrigin(session),
    },
    {
      title: '标记',
      key: 'flags',
      width: 150,
      search: false,
      render: (_, session) => (
        <Space wrap>
          {session.isCurrentSession ? <Tag color="blue">当前会话</Tag> : null}
          {session.isCurrentUser ? <Tag>本人</Tag> : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      search: false,
      render: (_, session) => (
        <Space orientation="vertical" size="small">
          <Button
            danger
            disabled={session.isCurrentSession}
            loading={revokingTarget === `session:${session.principalSessionId}`}
            onClick={() => confirmRevokeSession(session)}
          >
            强制下线本次
          </Button>
          <Button
            danger
            disabled={session.user.id === null}
            loading={revokingTarget === `user:${session.user.id}`}
            onClick={() => confirmRevokeUser(session)}
          >
            下线该用户全部
          </Button>
        </Space>
      ),
    },
  ];

  const sessionRecords = (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="仅展示尚未过期且未撤销的会话记录；记录存在不代表当前允许访问。"
        description="账号状态或会话所属代际可能已失效，尚未清理的记录仍可在此撤销。"
      />
      <Alert
        showIcon
        type="info"
        message="登录来源仅供调查参考，不是可信设备身份或授权依据。"
      />
      {auditFailedAfterEffect ? (
        <Alert
          showIcon
          type="error"
          message="操作可能已生效，但审计记录失败，请刷新确认且不要自动重试"
          description="列表刷新成功不代表审计记录已补齐，请联系管理员核查。"
        />
      ) : null}
      {loadError ? (
        <Alert
          showIcon
          type="error"
          message={
            loadError === SessionListErrorKind.LoginStateUnavailable
              ? '登录状态服务暂时不可用'
              : '会话记录加载失败'
          }
          description="请稍后手动刷新。"
        />
      ) : null}
      <ProTable<SessionListItem>
        actionRef={actionRef}
        rowKey="principalSessionId"
        columns={columns}
        dataSource={sessionRows}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1350 }}
        options={{ reload: false }}
        locale={loadError ? { emptyText: '加载失败' } : undefined}
        pagination={{
          defaultPageSize: 20,
          pageSizeOptions: [20, 50, 100],
          showSizeChanger: true,
        }}
        request={async (params) => {
          const {
            current = 1,
            pageSize = 20,
            userId,
          } = params as {
            current?: number;
            pageSize?: number;
            userId?: number;
          };
          try {
            const response = await listSessions({
              conditions: {
                userId: typeof userId === 'number' ? userId : undefined,
              },
              pageNum: current,
              pageSize,
            });
            setLoadError(null);
            setSessionRows(response.result);
            return {
              data: response.result,
              total: response.total,
              success: true,
            };
          } catch (error) {
            setLoadError(
              error instanceof SessionListError
                ? error.kind
                : SessionListErrorKind.RequestFailed,
            );
            setSessionRows([]);
            return {
              data: [],
              total: 0,
              success: false,
            };
          }
        }}
        toolBarRender={() => [
          <Button key="refresh" onClick={() => actionRef.current?.reload()}>
            手动刷新
          </Button>,
        ]}
      />
    </Space>
  );

  return (
    <PageContainer title="会话管理">
      <Tabs
        defaultActiveKey="records"
        items={[
          {
            key: 'records',
            label: '会话记录',
            children: sessionRecords,
          },
          {
            key: 'restrictions',
            label: '临时登录限制',
            children: <LoginRestrictionsTab />,
          },
        ]}
      />
    </PageContainer>
  );
}
