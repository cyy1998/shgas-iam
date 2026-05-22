import StatusTag from '@admin/components/StatusTag';
import ClientFormModal from '@admin/pages/clients/components/ClientFormModal';
import {
  deleteClient,
  getClient,
  searchClients,
  updateClientStatus,
  type ClientDetailVo,
  type ClientVo,
} from '@admin/services/client';
import { PlusOutlined } from '@ant-design/icons';
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import {
  ClientManagementLevel,
  getClientManagementLevelOptions,
  getClientStatusOptions,
} from '@iam/contracts';
import { Button, Dropdown, message, Modal } from 'antd';
import { useRef, useState } from 'react';

type FormState =
  | { open: false }
  | { open: true; initialValues: ClientDetailVo | null };

const managementLevelText = Object.fromEntries(
  getClientManagementLevelOptions().map((o) => [o.value, o.label]),
);

export default function ClientsPage() {
  const actionRef = useRef<ActionType>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const onEdit = async (row: ClientVo) => {
    try {
      const detail = await getClient(row.clientCode);
      setFormState({ open: true, initialValues: detail });
    } catch (err) {
      handleError(err);
    }
  };

  const onDelete = (row: ClientVo) => {
    Modal.confirm({
      title: `删除应用 ${row.clientName}？`,
      content: '软删除后应用不会出现在管理列表中，相关缓存也会被清理。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteClient(row.clientCode);
          message.success('已删除');
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: ClientVo, status: number) => {
    try {
      await updateClientStatus(row.clientCode, status as 1 | 2 | 3);
      message.success('状态已更新');
      actionRef.current?.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<ClientVo>[] = [
    { title: '应用编码', dataIndex: 'clientCode', width: 150 },
    { title: '应用名称', dataIndex: 'clientName', width: 180 },
    { title: '访问地址', dataIndex: 'url', ellipsis: true, search: false },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getClientStatusOptions().map((o) => [o.value, { text: o.label }]),
      ),
      render: (_, row) => <StatusTag domain="client" status={row.status} />,
    },
    {
      title: '管理模式',
      dataIndex: 'managementLevel',
      width: 130,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getClientManagementLevelOptions().map((o) => [
          o.value,
          { text: o.label },
        ]),
      ),
      render: (_, row) =>
        managementLevelText[row.extAttributes.managementLevel] ?? '未知',
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
      width: 220,
      render: (_, row) => [
        <a key="edit" onClick={() => onEdit(row)}>
          编辑
        </a>,
        <Dropdown
          key="status"
          menu={{
            items: getClientStatusOptions()
              .filter((o) => o.value !== row.status)
              .map((o) => ({
                key: String(o.value),
                label: `切为「${o.label}」`,
                onClick: () => onStatusChange(row, o.value),
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
    <PageContainer title="应用管理">
      <ProTable<ClientVo>
        actionRef={actionRef}
        rowKey="clientCode"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              clientCode,
              clientName,
              status,
              managementLevel,
            } = params as {
              current?: number;
              pageSize?: number;
              clientCode?: string;
              clientName?: string;
              status?: string | number;
              managementLevel?: ClientManagementLevel;
            };
            const text = (clientCode || clientName || '') as string;
            const statusNum =
              status === undefined || status === null || status === ''
                ? undefined
                : (Number(status) as 1 | 2 | 3);
            const data = await searchClients({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses: statusNum !== undefined ? [statusNum] : undefined,
                  managementLevels: managementLevel
                    ? [managementLevel]
                    : undefined,
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
            onClick={() => setFormState({ open: true, initialValues: null })}
          >
            新建应用
          </Button>,
        ]}
      />

      <ClientFormModal
        open={formState.open}
        initialValues={formState.open ? formState.initialValues : null}
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={() => {
          setFormState({ open: false });
          actionRef.current?.reload();
        }}
      />
    </PageContainer>
  );
}
