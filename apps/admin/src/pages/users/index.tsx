import StatusTag from '@admin/components/StatusTag';
import UserDetailDrawer from '@admin/pages/users/components/UserDetailDrawer';
import UserFormModal from '@admin/pages/users/components/UserFormModal';
import {
  searchUsers,
  type UserDetailVo,
  type UserVo,
} from '@admin/services/user';
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import {
  getUserStatusOptions,
  getUserTypeOptions,
  type UserStatus,
  type UserType,
} from '@iam/contracts';
import { useAccess } from '@umijs/max';
import { Button, message } from 'antd';
import { useRef, useState } from 'react';

type FormState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; initialValues: UserDetailVo };

export default function UsersPage() {
  const access = useAccess();
  const actionRef = useRef<ActionType>(undefined);
  const [formState, setFormState] = useState<FormState>({ open: false });
  const [drawerUsername, setDrawerUsername] = useState<string | null>(null);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const columns: ProColumns<UserVo>[] = [
    {
      title: '用户',
      dataIndex: 'user',
      hideInTable: true,
      fieldProps: { placeholder: '工号或姓名' },
    },
    { title: '工号', dataIndex: 'username', width: 120, search: false },
    { title: '姓名', dataIndex: 'name', width: 120, search: false },
    { title: '手机', dataIndex: 'mobile', width: 140, search: false },
    {
      title: '类型',
      dataIndex: 'userType',
      width: 120,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getUserTypeOptions().map((o) => [o.value, { text: o.label }]),
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getUserStatusOptions().map((o) => [o.value, { text: o.label }]),
      ),
      render: (_, row) => <StatusTag domain="user" status={row.status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      search: false,
      render: (_, row) => new Date(row.createTime).toLocaleString(),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, row) => (
        <a key="view" onClick={() => setDrawerUsername(row.username)}>
          查看
        </a>
      ),
    },
  ];

  return (
    <PageContainer title="用户管理">
      <ProTable<UserVo>
        actionRef={actionRef}
        rowKey="username"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1050 }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              user,
              status,
              userType,
            } = params as {
              current?: number;
              pageSize?: number;
              user?: string;
              status?: string | number;
              userType?: UserType;
            };
            const text = (user ?? '').trim();
            const statusNum =
              status === undefined || status === null || status === ''
                ? undefined
                : (Number(status) as UserStatus);
            const data = await searchUsers({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses: statusNum !== undefined ? [statusNum] : undefined,
                  userTypes: userType ? [userType] : undefined,
                },
              },
            });
            return {
              data: data.result,
              total: data.total,
              success: true,
            };
          } catch (err) {
            handleError(err);
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() =>
          access.canCreateUser
            ? [
                <Button
                  key="create"
                  type="primary"
                  onClick={() => setFormState({ open: true, mode: 'create' })}
                >
                  + 新建用户
                </Button>,
              ]
            : []
        }
      />

      <UserFormModal
        open={formState.open}
        mode={formState.open ? formState.mode : 'create'}
        initialValues={
          formState.open && formState.mode === 'edit'
            ? formState.initialValues
            : null
        }
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={() => {
          setFormState({ open: false });
          actionRef.current?.reload();
        }}
      />

      <UserDetailDrawer
        open={drawerUsername !== null}
        username={drawerUsername}
        onClose={() => setDrawerUsername(null)}
        onEdit={(detail) => {
          setDrawerUsername(null);
          setFormState({ open: true, mode: 'edit', initialValues: detail });
        }}
        onChanged={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
}
