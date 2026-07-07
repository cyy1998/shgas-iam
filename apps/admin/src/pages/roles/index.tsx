import StatusTag from '@admin/components/StatusTag';
import RoleDetailDrawer from '@admin/pages/roles/components/RoleDetailDrawer';
import RoleFormModal from '@admin/pages/roles/components/RoleFormModal';
import { requestClientOptions } from '@admin/pages/roles/role-selectors';
import {
  type RoleDetailVo,
  type RoleVo,
  deleteRole,
  getRole,
  searchRoles,
  updateRoleStatus,
} from '@admin/services/role';
import { PlusOutlined } from '@ant-design/icons';
import {
  ActionType,
  PageContainer,
  ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import { getRoleStatusOptions, RoleStatus } from '@iam/contracts';
import { Button, Dropdown, message, Modal } from 'antd';
import { useRef, useState } from 'react';

export default function RolesPage() {
  const actionRef = useRef<ActionType>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleDetailVo | null>(null);
  const [drawerRoleCode, setDrawerRoleCode] = useState<string | null>(null);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const reload = () => actionRef.current?.reload();

  const onCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const onEdit = async (row: RoleVo) => {
    try {
      setEditing(await getRole(row.roleCode));
      setFormOpen(true);
    } catch (err) {
      handleError(err);
    }
  };

  const onDelete = (row: RoleVo) => {
    Modal.confirm({
      title: `删除角色 ${row.roleName}？`,
      content: '仅无分配对象的角色可以删除，删除后不会再出现在角色列表中。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteRole(row.roleCode);
          message.success('角色已删除');
          reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: RoleVo, status: RoleStatus) => {
    try {
      await updateRoleStatus(row.roleCode, status);
      message.success('状态已更新');
      reload();
    } catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<RoleVo>[] = [
    { title: '角色编码', dataIndex: 'roleCode', width: 170 },
    { title: '角色名称', dataIndex: 'roleName', width: 180 },
    {
      title: '所属应用',
      dataIndex: 'clientCode',
      width: 180,
      valueType: 'select',
      request: requestClientOptions,
      fieldProps: {
        filterOption: false,
        placeholder: '输入应用名称或编码搜索',
        showSearch: true,
      },
      render: (_, row) =>
        `${row.client.clientName}（${row.client.clientCode}）`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getRoleStatusOptions().map((o) => [o.value, { text: o.label }]),
      ),
      render: (_, row) => <StatusTag domain="role" status={row.status} />,
    },
    {
      title: '分配数',
      dataIndex: 'assignmentCount',
      width: 100,
      search: false,
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
      width: 260,
      render: (_, row) => [
        <a key="detail" onClick={() => setDrawerRoleCode(row.roleCode)}>
          详情
        </a>,
        <a key="edit" onClick={() => onEdit(row)}>
          编辑
        </a>,
        <Dropdown
          key="status"
          menu={{
            items: getRoleStatusOptions()
              .filter((o) => o.value !== row.status)
              .map((o) => ({
                key: String(o.value),
                label: `切为「${o.label}」`,
                onClick: () => onStatusChange(row, o.value as RoleStatus),
              })),
          }}
        >
          <a>状态</a>
        </Dropdown>,
        <a
          key="delete"
          style={{ color: '#d4380d' }}
          onClick={() => onDelete(row)}
        >
          删除
        </a>,
      ],
    },
  ];

  return (
    <PageContainer title="角色管理">
      <ProTable<RoleVo>
        actionRef={actionRef}
        rowKey="roleCode"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              roleCode,
              roleName,
              clientCode,
              status,
            } = params as {
              current?: number;
              pageSize?: number;
              roleCode?: string;
              roleName?: string;
              clientCode?: string;
              status?: string | number;
            };
            const text = (roleCode || roleName || '') as string;
            const statusValue =
              status === undefined ? undefined : (Number(status) as RoleStatus);
            const data = await searchRoles({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  clientCode: clientCode || undefined,
                  status: Number.isNaN(statusValue) ? undefined : statusValue,
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
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={onCreate}
          >
            新建角色
          </Button>,
        ]}
      />
      <RoleFormModal
        open={formOpen}
        initialValues={editing}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          setFormOpen(false);
          reload();
        }}
      />
      <RoleDetailDrawer
        open={drawerRoleCode !== null}
        roleCode={drawerRoleCode}
        onOpenChange={(open) => {
          if (!open) setDrawerRoleCode(null);
        }}
        onChanged={reload}
      />
    </PageContainer>
  );
}
