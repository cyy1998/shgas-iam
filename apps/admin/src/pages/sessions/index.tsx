import LoginRestrictionsTab from '@admin/pages/sessions/LoginRestrictionsTab';
import ClientSessionsTable from '@admin/pages/sessions/components/ClientSessionsTable';
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
  type SessionRevokeResult,
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
import { useCallback, useRef, useState } from 'react';

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
  '操作开始时已索引的会话将被处理；操作期间或之后建立的新会话仍可能存在。IAM 不能保证第三方自行建立的本地会话退出。强制下线不会阻止未来重新登录；如怀疑凭据泄露，请同时执行密码重置、账号暂停或停用。';

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
  const clientActionRef = useRef<ActionType>(undefined);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState<SessionListErrorKindValue | null>(
    null,
  );
  const [sessionRows, setSessionRows] = useState<SessionListItem[]>([]);
  const [auditFailedAfterEffect, setAuditFailedAfterEffect] = useState(false);
  const [revokingTarget, setRevokingTarget] = useState<string | null>(null);
  const [canRevoke, setCanRevoke] = useState(false);
  const capabilityRequestRef = useRef(0);
  const beginCapabilityRead = useCallback(() => {
    const sequence = ++capabilityRequestRef.current;
    return (allowed: boolean) => {
      if (sequence === capabilityRequestRef.current) setCanRevoke(allowed);
    };
  }, []);
  const [unfinished, setUnfinished] = useState<
    NonNullable<SessionRevokeResult['result']['batch']>['unfinished']
  >([]);

  const refreshSessions = () => {
    actionRef.current?.reload();
    clientActionRef.current?.reload();
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
      const sessions = result.result.sessions;
      setUnfinished(result.result.batch?.unfinished ?? []);
      const batch = result.result.batch;
      const cleanup = result.result.artifactCleanup;
      const finished = batch
        ? `；缺失/过期 ${batch.results.filter((item) => item.status === 'missing' || item.status === 'expired').length} 项，原已终止 ${batch.results.filter((item) => item.status === 'already_terminated').length} 项，替换保留 ${batch.results.filter((item) => item.status === 'replaced').length} 项`
        : '';
      const artifact = cleanup
        ? `；产物回收尝试 ${cleanup.attempted} 项、成功 ${cleanup.succeeded} 项、失败 ${cleanup.failed} 项`
        : '';
      const detail = `已终止 ${sessions.userSessionsTerminated} 个根会话、${sessions.clientSessionsTerminated} 个应用会话；保留 ${sessions.excluded} 个当前根${finished}${artifact}`;
      if (sessions.failed > 0 || sessions.unknown > 0) {
        message.warning(
          `${detail}；失败 ${sessions.failed} 项，结果未知 ${sessions.unknown} 项，${result.result.batch ? '可主动重试原未完成集合' : '请刷新后明确发起新操作'}`,
        );
      } else if (cleanup && cleanup.failed > 0) {
        message.warning(detail);
      } else if (result.changed) {
        message.success(detail);
      } else {
        message.info(detail);
      }
    } catch (error) {
      if (
        error instanceof SessionRevokeError &&
        error.kind === SessionRevokeErrorKind.AuditFailedAfterEffect
      ) {
        refreshAfterOperation = true;
        setAuditFailedAfterEffect(true);
        if (input.target.type === 'captured')
          setUnfinished(input.target.targets);
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
    const record = session.record;
    if (!record) return;
    Modal.confirm({
      title: '确认强制下线本次会话？',
      content:
        record.kind === 'clientSession'
          ? `终止这个应用会话，其协议凭据后续访问将被拒绝；保留用户登录和其他应用会话。${userRevokeSafetyGuidance}`
          : `终止这个根登录并尽力处理其已捕获的应用关系；根终止后新协议访问将被拒绝。${userRevokeSafetyGuidance}`,
      okText: '确认下线',
      okType: 'danger',
      cancelText: '取消',
      onOk: () =>
        executeRevoke(
          record.kind === 'clientSession'
            ? {
                target: {
                  type: 'captured',
                  targets: [record.identity],
                },
              }
            : {
                target: {
                  type: 'session',
                  principalSessionId: session.principalSessionId,
                },
              },
          `session:${record.identity.id}`,
        ),
    });
  };

  const confirmRevokeUser = (session: SessionListItem) => {
    if (session.user.id === null) return;
    const targetUserId = session.user.id;

    Modal.confirm({
      title: '确认下线该用户全部会话？',
      content: `${session.isCurrentUser ? '保留当前管理端根会话（UserSession）本身；尝试终止包括当前根在内的目标根下已捕获应用关系，以及本人的其他根会话；' : ''}先捕获该用户的根登录和应用关系，再精确终止原实例；重试只处理未完成集合。${userRevokeSafetyGuidance}`,
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
      width: 160,
      search: false,
      render: (_, session) => (
        <UserSummary
          accountStatus={session.user.accountStatus}
          name={session.user.name}
          username={session.user.username}
        />
      ),
    },
    {
      title: '登录方式',
      dataIndex: 'authMethods',
      width: 110,
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
      fixed: 'right',
      key: 'actions',
      width: 160,
      search: false,
      render: (_, session) => (
        <Space orientation="vertical" align="start" size={0}>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0, fontWeight: 500 }}
            disabled={session.record?.kind !== 'userSession'}
            onClick={() =>
              setExpandedSessionId((current) =>
                current === session.principalSessionId
                  ? null
                  : session.principalSessionId,
              )
            }
          >
            {expandedSessionId === session.principalSessionId
              ? '收起应用会话'
              : '应用会话'}
          </Button>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0, fontWeight: 500 }}
            danger
            disabled={
              !canRevoke ||
              !session.record ||
              session.isCurrentSession ||
              revokingTarget !== null ||
              unfinished.length > 0
            }
            loading={revokingTarget === `session:${session.principalSessionId}`}
            onClick={() => confirmRevokeSession(session)}
          >
            强制下线本次
          </Button>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0, fontWeight: 500 }}
            danger
            disabled={
              !canRevoke ||
              !session.record ||
              session.user.id === null ||
              revokingTarget !== null ||
              unfinished.length > 0
            }
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
      {unfinished.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`原批次仍有 ${unfinished.length} 项未确认完成`}
          description="重试只处理保存的原实例。结果丢失后需重新查询并发起新操作，不会自动扩大旧批次。"
          action={
            <Button
              disabled={!canRevoke || revokingTarget !== null}
              onClick={() =>
                Modal.confirm({
                  title: '确认重试原未完成集合？',
                  content: '只重试上次返回的原确切实例，不纳入后来创建的会话。',
                  onOk: () =>
                    executeRevoke(
                      { target: { type: 'captured', targets: unfinished } },
                      'retry',
                    ),
                })
              }
            >
              重试未完成集合
            </Button>
          }
        />
      ) : null}
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
        rowKey={(session) =>
          session.record?.identity.id ?? session.principalSessionId
        }
        columns={columns}
        expandable={{
          expandedRowKeys: expandedSessionId ? [expandedSessionId] : [],
          showExpandColumn: false,
          expandedRowRender: (session, _index, _indent, expanded) =>
            expanded ? (
              <ClientSessionsTable
                key={session.principalSessionId}
                userSessionId={session.principalSessionId}
                actionRef={clientActionRef}
                revokingTarget={revokingTarget}
                hasUnfinished={unfinished.length > 0}
                canRevoke={canRevoke}
                onRevoke={confirmRevokeSession}
                beginCapabilityRead={beginCapabilityRead}
              />
            ) : null,
        }}
        dataSource={sessionRows}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1160 }}
        options={{ reload: false }}
        locale={loadError ? { emptyText: '加载失败' } : undefined}
        pagination={{
          defaultPageSize: 20,
          pageSizeOptions: [20, 50, 100],
          showSizeChanger: true,
        }}
        request={async (params) => {
          const updateCapability = beginCapabilityRead();
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
                kind: 'userSession',
              },
              pageNum: current,
              pageSize,
            });
            setLoadError(null);
            updateCapability(response.allowedActions?.revoke === true);
            setSessionRows(response.result);
            return {
              data: response.result,
              total: response.total,
              success: true,
            };
          } catch (error) {
            updateCapability(false);
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
