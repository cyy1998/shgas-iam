import StatusTag from '@admin/components/StatusTag';
import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import TransferModal from '@admin/pages/employments/components/TransferModal';
import {
  deleteEmployment,
  type EmploymentVo,
  updateEmploymentStatus,
} from '@admin/services/employment';
import {
  deleteUser,
  getUser,
  updateUserStatus,
  type UserDetailVo,
} from '@admin/services/user';
import { ProDescriptions } from '@ant-design/pro-components';
import {
  EmploymentStatus,
  getEmploymentStatusOptions,
  getUserStatusOptions,
} from '@iam/contracts';
import {
  Button,
  Drawer,
  Dropdown,
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

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '—';

const formatEmploymentOrgPath = (row: EmploymentRow) =>
  row.organization?.fullOrgPath?.map(node => node.orgName).join(' / ')
  || row.orgName
  || '—';

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
  const [detail, setDetail] = useState<UserDetailVo | null>(null);
  const [loading, setLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState<EmploymentVo | null>(
    null,
  );
  const [employmentFormOpen, setEmploymentFormOpen] = useState(false);

  useEffect(() => {
    if (!open || !username) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getUser(username)
      .then(setDetail)
      .catch((err: unknown) =>
        message.error(err instanceof Error ? err.message : '加载详情失败'),
      )
      .finally(() => setLoading(false));
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

  const onStatusChange = async (status: number) => {
    if (!detail) return;
    try {
      await updateUserStatus(detail.username, status as 1 | 2 | 3);
      message.success('状态已更新');
      await refresh();
    } catch (err) {
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
          await deleteUser(detail.username);
          message.success('已删除');
          onChanged();
          onClose();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onEmploymentStatusChange = async (
    row: EmploymentRow,
    status: 1 | 2 | 3,
  ) => {
    try {
      await updateEmploymentStatus(row.id, status);
      message.success('状态已更新');
      await refresh();
    } catch (err) {
      handleError(err);
    }
  };

  const onEmploymentDelete = (row: EmploymentRow) => {
    Modal.confirm({
      title: `删除雇佣 ${row.posName}？`,
      content: '软删除后该雇佣记录不再可见。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteEmployment(row.id);
          message.success('已删除');
          await refresh();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const employmentColumns: ColumnsType<EmploymentRow> = [
    {
      title: '组织路径',
      dataIndex: 'orgName',
      render: (_val: string | undefined, row) => formatEmploymentOrgPath(row),
    },
    {
      title: '岗位',
      dataIndex: 'posName',
      render: (val: string | undefined) => val ?? '—',
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
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, row: EmploymentRow) => {
        if (row.status === EmploymentStatus.Disable) return null;
        return (
          <Space size="middle">
            <a
              onClick={() => setTransferTarget(row as unknown as EmploymentVo)}
            >
              转岗
            </a>
            <Dropdown
              menu={{
                items: getEmploymentStatusOptions()
                  .filter((o) => o.value !== row.status)
                  .map((o) => ({
                    key: String(o.value),
                    label: `切为「${o.label}」`,
                    onClick: () =>
                      onEmploymentStatusChange(row, o.value as 1 | 2 | 3),
                  })),
              }}
            >
              <a>状态</a>
            </Dropdown>
            <a
              style={{ color: '#d4380d' }}
              onClick={() => onEmploymentDelete(row)}
            >
              删除
            </a>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <EmploymentFormModal
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
        open={transferTarget !== null}
        employment={transferTarget}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
        onSuccess={async () => {
          setTransferTarget(null);
          await refresh();
        }}
      />
      <Drawer
        width={640}
        open={open}
        onClose={onClose}
        destroyOnClose
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
              <Button onClick={() => onEdit(detail)}>编辑</Button>
              <Dropdown
                menu={{
                  items: getUserStatusOptions()
                    .filter((o) => o.value !== detail.status)
                    .map((o) => ({
                      key: String(o.value),
                      label: `切为「${o.label}」`,
                      onClick: () => onStatusChange(o.value),
                    })),
                }}
              >
                <Button>状态</Button>
              </Dropdown>
              <Button
                onClick={() =>
                  confirmResetPassword({
                    username: detail.username,
                    name: detail.name,
                  })
                }
              >
                重置密码
              </Button>
              <Button danger onClick={onDelete}>
                删除
              </Button>
            </Space>
          )
        }
      >
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
                    <div style={{ marginBottom: 12, textAlign: 'right' }}>
                      <Button
                        type="primary"
                        onClick={() => setEmploymentFormOpen(true)}
                      >
                        + 新增雇佣
                      </Button>
                    </div>
                    <Table<EmploymentRow>
                      rowKey="id"
                      size="small"
                      columns={employmentColumns}
                      dataSource={detail.employments}
                      pagination={false}
                      scroll={{ x: 780 }}
                      locale={{ emptyText: '暂无雇佣' }}
                    />
                  </div>
                ),
              },
              {
                key: 'logs',
                label: '操作日志',
                children: <Empty description="日志功能尚未接入" />,
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
