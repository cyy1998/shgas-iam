import UserSummary from '@admin/pages/sessions/components/UserSummary';
import { requestUserOptions } from '@admin/pages/sessions/session-selectors';
import {
  listLoginRestrictions,
  LoginRestrictionListError,
  LoginRestrictionListErrorKind,
  type LoginRestrictionListErrorKindValue,
  type LoginRestrictionListItem,
  LoginRestrictionReleaseError,
  LoginRestrictionReleaseErrorKind,
  releaseLoginRestriction,
} from '@admin/services/session-management';
import {
  type ActionType,
  type ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import { Alert, Button, message, Modal, Space } from 'antd';
import { useEffect, useRef, useState } from 'react';

const triggerMethodDisplay = {
  password: '密码',
  mobile: '手机验证码',
  unknown: '未知',
} as const;

function formatRemainingSeconds(remainingSeconds: number) {
  const safeRemaining = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safeRemaining / 60);
  const seconds = safeRemaining % 60;
  return `剩余 ${minutes} 分 ${seconds} 秒`;
}

function RemainingTime(props: { initialSeconds: number }) {
  const { initialSeconds } = props;
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (initialSeconds <= 0) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
      const nextRemainingSeconds = Math.max(0, initialSeconds - elapsedSeconds);
      setRemainingSeconds(nextRemainingSeconds);
      if (nextRemainingSeconds === 0) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [initialSeconds]);

  return formatRemainingSeconds(remainingSeconds);
}

export default function LoginRestrictionsTab() {
  const actionRef = useRef<ActionType>(undefined);
  const [loadError, setLoadError] =
    useState<LoginRestrictionListErrorKindValue | null>(null);
  const [restrictionRows, setRestrictionRows] = useState<
    LoginRestrictionListItem[]
  >([]);
  const [releasingUserId, setReleasingUserId] = useState<number | null>(null);
  const [auditFailedAfterEffect, setAuditFailedAfterEffect] = useState(false);

  const refreshRestrictions = () => {
    actionRef.current?.reload();
  };

  const executeRelease = async (userId: number) => {
    let refreshAfterOperation = false;
    setReleasingUserId(userId);
    try {
      const result = await releaseLoginRestriction({ userId });
      refreshAfterOperation = true;
      if (result.changed) {
        message.success('临时登录限制已解除，当前失败历史已清理');
      } else {
        message.warning('限制已自然过期或已被处理');
      }
    } catch (error) {
      if (
        error instanceof LoginRestrictionReleaseError &&
        error.kind === LoginRestrictionReleaseErrorKind.AuditFailedAfterEffect
      ) {
        refreshAfterOperation = true;
        setAuditFailedAfterEffect(true);
      } else if (
        error instanceof LoginRestrictionReleaseError &&
        error.kind === LoginRestrictionReleaseErrorKind.LoginStateUnavailable
      ) {
        message.error('登录状态服务暂时不可用');
      } else {
        message.error('临时登录限制解除失败');
      }
    } finally {
      setReleasingUserId(null);
      if (refreshAfterOperation) {
        window.setTimeout(refreshRestrictions, 0);
      }
    }
  };

  const confirmRelease = (restriction: LoginRestrictionListItem) => {
    Modal.confirm({
      title: '确认解除临时登录限制？',
      content:
        '解除会同时清除临时登录限制和当前失败历史，不会创建白名单或宽限期；之后发生的新失败会立即重新计数。此操作不会撤销、创建、续期或恢复任何已有 Principal Session。',
      okText: '确认解除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => executeRelease(restriction.user.id),
    });
  };

  const columns: ProColumns<LoginRestrictionListItem>[] = [
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
      render: (_, restriction) => (
        <UserSummary
          accountStatus={restriction.user.accountStatus}
          id={restriction.user.id}
          name={restriction.user.name}
          username={restriction.user.username}
        />
      ),
    },
    {
      title: '限制原因',
      dataIndex: 'cause',
      width: 180,
      search: false,
      render: () => '登录失败次数过多',
    },
    {
      title: '最后触发方式',
      dataIndex: 'triggerMethod',
      width: 150,
      search: false,
      render: (_, restriction) =>
        triggerMethodDisplay[restriction.triggerMethod],
    },
    {
      title: '自动解除时间',
      dataIndex: 'restrictedUntil',
      width: 180,
      search: false,
      render: (_, restriction) =>
        new Date(restriction.restrictedUntil).toLocaleString(),
    },
    {
      title: '剩余时间',
      dataIndex: 'remainingSeconds',
      width: 140,
      search: false,
      render: (_, restriction) => (
        <RemainingTime
          key={`${restriction.restrictedUntil}:${restriction.remainingSeconds}`}
          initialSeconds={restriction.remainingSeconds}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      search: false,
      render: (_, restriction) => (
        <Button
          danger
          loading={releasingUserId === restriction.user.id}
          onClick={() => confirmRelease(restriction)}
        >
          解除限制
        </Button>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="临时登录限制只阻止新的认证，不影响任何已有有效会话。"
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
            loadError === LoginRestrictionListErrorKind.LoginStateUnavailable
              ? '登录状态服务暂时不可用'
              : '临时登录限制加载失败'
          }
          description="请稍后手动刷新。"
        />
      ) : null}
      <ProTable<LoginRestrictionListItem>
        actionRef={actionRef}
        rowKey={(restriction) => restriction.user.id}
        columns={columns}
        dataSource={restrictionRows}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1110 }}
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
            const response = await listLoginRestrictions({
              conditions: {
                userId: typeof userId === 'number' ? userId : undefined,
              },
              pageNum: current,
              pageSize,
            });
            setLoadError(null);
            setRestrictionRows(response.result);
            return {
              data: response.result,
              total: response.total,
              success: true,
            };
          } catch (error) {
            setLoadError(
              error instanceof LoginRestrictionListError
                ? error.kind
                : LoginRestrictionListErrorKind.RequestFailed,
            );
            setRestrictionRows([]);
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
}
