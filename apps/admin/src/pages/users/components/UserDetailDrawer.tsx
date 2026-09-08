import AuditLogTable from '@admin/components/audit/AuditLogTable';
import AuthorizationActionButton from '@admin/components/AuthorizationActionButton';
import AuthorizationActionDropdown from '@admin/components/AuthorizationActionDropdown';
import EmploymentLifecycleActions from '@admin/components/EmploymentLifecycleActions';
import EmploymentPrimaryActions from '@admin/components/EmploymentPrimaryActions';
import EmploymentResponsibilitySummary from '@admin/components/organization-responsibility/EmploymentResponsibilitySummary';
import StatusTag from '@admin/components/StatusTag';
import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import TransferModal from '@admin/pages/employments/components/TransferModal';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { resignUser } from '@admin/services/employment';
import {
  deleteUser,
  getUser,
  updateUserStatus,
  type UserDetailVo,
} from '@admin/services/user';
import { ProDescriptions } from '@ant-design/pro-components';
import { getUserStatusOptions, type UserStatus } from '@iam/contracts';
import { Link, useAccess } from '@umijs/max';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  message,
  Modal,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { confirmResetPassword } from './ResetPasswordModal';

type EmploymentRow = UserDetailVo['employments'][number];

const roleListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  maxWidth: '100%',
  minWidth: 0,
};

const roleTagStyle: CSSProperties = {
  marginInlineEnd: 0,
  maxWidth: '100%',
  whiteSpace: 'normal',
  wordBreak: 'break-all',
};

const employmentTableActionStyle: CSSProperties = {
  fontWeight: 'inherit',
  paddingInline: 0,
};

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '—';

const formatEmploymentOrgPath = (row: EmploymentRow) =>
  row.organization?.fullOrgPath?.map((node) => node.orgName).join(' / ') ||
  row.organization.assignedOrg.orgName ||
  '—';

const formatEmploymentPosition = (row: EmploymentRow) =>
  `${row.position.posName} (${row.position.posCode})`;

type Props = {
  open: boolean;
  username: string | null;
  onClose: () => void;
  onEdit: (detail: UserDetailVo) => void;
  onChanged: () => void;
};

export default function UserDetailDrawer({
  open,
  username,
  onClose,
  onEdit,
  onChanged,
}: Props) {
  return (
    <UserDetailDrawerContent
      key={open ? username : 'closed'}
      open={open}
      username={username}
      onClose={onClose}
      onEdit={onEdit}
      onChanged={onChanged}
    />
  );
}

function UserDetailDrawerContent({
  open,
  username,
  onClose,
  onEdit,
  onChanged,
}: Props) {
  const access = useAccess();
  const [committedWarning, setCommittedWarning] = useState<string>();
  const [detail, setDetail] = useState<UserDetailVo | null>(null);
  const [loading, setLoading] = useState(open && username !== null);
  const [employmentFormOpen, setEmploymentFormOpen] = useState(false);
  const [transferEmployment, setTransferEmployment] =
    useState<EmploymentRow | null>(null);

  useEffect(() => {
    if (!open || !username) return;

    let cancelled = false;
    getUser(username)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载详情失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, username]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const refresh = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const d = await getUser(username);
      setDetail(d);
    } finally {
      setLoading(false);
    }
    onChanged();
  };

  const onEmploymentCommitted = async (error: AdminMutationCommittedError) => {
    setCommittedWarning(error.message);
    setEmploymentFormOpen(false);
    setTransferEmployment(null);
    try {
      await refresh();
    } catch (refreshError) {
      handleError(refreshError);
    }
  };

  const onStatusChange = async (status: UserStatus) => {
    if (!detail) return;
    try {
      const outcome = await updateUserStatus(detail.username, status);
      if (outcome.changed) message.success('状态已更新');
      else message.info('状态无需修改');
      await refresh();
    } catch (err) {
      if (err instanceof AdminMutationCommittedError) {
        setCommittedWarning(err.message);
        try {
          await refresh();
        } catch (refreshError) {
          handleError(refreshError);
        }
        return;
      }
      handleError(err);
    }
  };

  const onDelete = () => {
    if (!detail) return;
    Modal.confirm({
      title: `删除用户 ${detail.name}？`,
      content: '软删除后用户将不再可见。若用户存在活跃雇佣，将被拒绝。',
      okType: 'danger',
      onOk: async () => {
        try {
          const outcome = await deleteUser(detail.username);
          if (outcome.changed) message.success('已删除');
          else message.info('无需删除');
          onChanged();
          onClose();
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            setCommittedWarning(`删除已生效。${err.message}`);
            setDetail(null);
            onChanged();
            try {
              await refresh();
            } catch (refreshError) {
              handleError(refreshError);
            }
            return;
          }
          handleError(err);
        }
      },
    });
  };

  const onResign = () => {
    if (!detail) return;
    Modal.confirm({
      title: `办理用户 ${detail.name} 离职？`,
      content: '该操作将结束全部开放任职并停用用户，提交后会尝试撤销现有会话。',
      okType: 'danger',
      onOk: async () => {
        try {
          const outcome = await resignUser(detail.username);
          if (outcome.changed) message.success('离职已完成');
          else message.info('已处于离职状态，无需修改');
          await refresh();
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            await onEmploymentCommitted(err);
            return;
          }
          handleError(err);
        }
      },
    });
  };

  const employmentColumns: ColumnsType<EmploymentRow> = [
    {
      title: '组织路径',
      dataIndex: ['organization', 'assignedOrg', 'orgName'],
      render: (_val: string | undefined, row) => formatEmploymentOrgPath(row),
    },
    {
      title: '岗位',
      dataIndex: ['position', 'posName'],
      render: (_val: string | undefined, row) => formatEmploymentPosition(row),
    },
    {
      title: '主岗',
      dataIndex: 'isPrimary',
      render: (val: boolean) => (val ? <Tag color="blue">主岗</Tag> : null),
      width: 70,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (_: unknown, row: EmploymentRow) => (
        <StatusTag domain="employment" status={row.status} />
      ),
      width: 90,
    },
    {
      title: '开始',
      dataIndex: 'startTime',
      render: (val: EmploymentRow['startTime']) => formatDate(val),
      width: 110,
    },
    {
      title: '结束',
      dataIndex: 'endTime',
      render: (val: EmploymentRow['endTime']) => formatDate(val),
      width: 110,
    },
  ];

  if (access.canAccessOrganizationResponsibility) {
    employmentColumns.push({
      title: '组织责任',
      key: 'responsibilities',
      width: 280,
      render: (_: unknown, row: EmploymentRow) => (
        <EmploymentResponsibilitySummary employmentId={row.id} />
      ),
    });
  }

  if (access.canAccessEmployment) {
    employmentColumns.push({
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: unknown, row: EmploymentRow) => {
        const hasAllowedAction = Object.values(row.allowedActions).some(
          (decision) => decision.allowed,
        );
        if (!row.managementPath && !hasAllowedAction) return null;
        return (
          <Space size="small">
            {row.managementPath ? (
              <Link to={row.managementPath}>查看任职</Link>
            ) : null}
            <AuthorizationActionButton
              decision={row.allowedActions.transfer}
              onClick={() => setTransferEmployment(row)}
              style={employmentTableActionStyle}
              type="link"
            >
              转岗
            </AuthorizationActionButton>
            <EmploymentPrimaryActions
              onCommitted={onEmploymentCommitted}
              decision={
                row.isPrimary
                  ? row.allowedActions.clearPrimary
                  : row.allowedActions.setPrimary
              }
              buttonStyle={employmentTableActionStyle}
              buttonType="link"
              employment={row}
              onSuccess={refresh}
            />
            <EmploymentLifecycleActions
              onCommitted={onEmploymentCommitted}
              buttonStyle={employmentTableActionStyle}
              buttonType="link"
              decisions={row.allowedActions}
              employment={row}
              onSuccess={refresh}
            />
          </Space>
        );
      },
    });
  }

  return (
    <>
      {access.canAccessEmployment && (
        <>
          <EmploymentFormModal
            onCommitted={onEmploymentCommitted}
            open={employmentFormOpen}
            presetUsername={detail?.username}
            presetName={detail?.name}
            onOpenChange={setEmploymentFormOpen}
            onSuccess={async () => {
              setEmploymentFormOpen(false);
              await refresh();
            }}
          />
          <TransferModal
            onCommitted={onEmploymentCommitted}
            open={transferEmployment !== null}
            employment={transferEmployment}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setTransferEmployment(null);
            }}
            onSuccess={async () => {
              setTransferEmployment(null);
              await refresh();
            }}
          />
        </>
      )}
      <Drawer
        size={640}
        open={open}
        onClose={onClose}
        destroyOnHidden
        title={
          detail ? (
            <Space>
              <span>{detail.name}</span>
              <span style={{ color: '#999', fontSize: 12 }}>
                {detail.username}
              </span>
              <StatusTag domain="user" status={detail.status} />
            </Space>
          ) : (
            '用户详情'
          )
        }
        extra={
          detail && (
            <Space>
              <AuthorizationActionButton
                decision={detail.allowedActions.editProfile}
                onClick={() => onEdit(detail)}
              >
                编辑
              </AuthorizationActionButton>
              <AuthorizationActionDropdown
                decision={detail.allowedActions.changeStatus}
                menu={{
                  items: getUserStatusOptions()
                    .filter((o) => o.value !== detail.status)
                    .map((o) => ({
                      key: String(o.value),
                      label: `切为「${o.label}」`,
                      onClick: () => onStatusChange(o.value as UserStatus),
                    })),
                }}
              >
                状态
              </AuthorizationActionDropdown>
              <AuthorizationActionButton
                decision={detail.allowedActions.resetPassword}
                onClick={() =>
                  confirmResetPassword({
                    username: detail.username,
                    name: detail.name,
                    onSuccess: refresh,
                    onCommitted: async (error) => {
                      setCommittedWarning(
                        `密码重置已生效，但新密码未能交付。${error.message}；请先修复，再主动重置密码。`,
                      );
                      try {
                        await refresh();
                      } catch (refreshError) {
                        handleError(refreshError);
                      }
                    },
                  })
                }
              >
                重置密码
              </AuthorizationActionButton>
              <AuthorizationActionButton
                danger
                decision={detail.allowedActions.delete}
                onClick={onDelete}
              >
                删除
              </AuthorizationActionButton>
              <AuthorizationActionButton
                danger
                decision={detail.allowedActions.resign}
                onClick={onResign}
              >
                离职
              </AuthorizationActionButton>
            </Space>
          )
        }
      >
        {committedWarning && (
          <Alert type="warning" showIcon message={committedWarning} />
        )}
        {loading && !detail ? <Skeleton active /> : null}
        {!loading && !detail ? <Empty /> : null}
        {detail && (
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基本信息',
                children: (
                  <ProDescriptions<UserDetailVo>
                    column={2}
                    dataSource={detail}
                    columns={[
                      { title: '用户名', dataIndex: 'username' },
                      { title: '姓名', dataIndex: 'name' },
                      {
                        title: '手机',
                        dataIndex: 'mobile',
                        render: (_, r) => r.mobile ?? '—',
                      },
                      {
                        title: '微信 ID',
                        dataIndex: 'wxId',
                        render: (_, r) => r.wxId ?? '—',
                      },
                      {
                        title: '用户类型',
                        dataIndex: 'userType',
                        render: (_, r) => r.userType ?? '—',
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        render: (_, r) => (
                          <StatusTag domain="user" status={r.status} />
                        ),
                      },
                      {
                        title: '角色',
                        dataIndex: 'roles',
                        span: 2,
                        contentStyle: { minWidth: 0 },
                        render: (_, r) =>
                          r.roles.length === 0 ? (
                            '—'
                          ) : (
                            <div style={roleListStyle}>
                              {r.roles.map((code: string) => (
                                <Tag key={code} style={roleTagStyle}>
                                  {code}
                                </Tag>
                              ))}
                            </div>
                          ),
                      },
                      {
                        title: '权限数',
                        dataIndex: 'privileges',
                        render: (_, r) => r.privileges.length,
                      },
                      {
                        title: '雇佣数',
                        dataIndex: 'employments',
                        render: (_, r) => r.employments.length,
                      },
                      {
                        title: '创建时间',
                        dataIndex: 'createTime',
                        render: (_, r) =>
                          new Date(r.createTime).toLocaleString(),
                      },
                      {
                        title: '更新时间',
                        dataIndex: 'updateTime',
                        render: (_, r) =>
                          new Date(r.updateTime).toLocaleString(),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'employments',
                label: `雇佣（${detail.employments.length}）`,
                children: (
                  <div>
                    {access.canCreateEmployment && (
                      <div style={{ marginBottom: 12, textAlign: 'right' }}>
                        <Button
                          type="primary"
                          onClick={() => setEmploymentFormOpen(true)}
                        >
                          + 新增雇佣
                        </Button>
                      </div>
                    )}
                    <Table<EmploymentRow>
                      rowKey="id"
                      size="small"
                      columns={employmentColumns}
                      dataSource={detail.employments}
                      pagination={false}
                      scroll={{ x: 1320 }}
                      locale={{ emptyText: '暂无雇佣' }}
                    />
                  </div>
                ),
              },
              ...(access.canAccessAudit
                ? [
                    {
                      key: 'logs',
                      label: '操作日志',
                      children: (
                        <AuditLogTable
                          fixedConditions={{
                            targetType: 'user',
                            targetCode: detail.username,
                          }}
                          pageSize={10}
                          search={false}
                          size="small"
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
