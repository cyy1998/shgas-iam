import StatusTag from '@admin/components/StatusTag';
import ClientFormModal from '@admin/pages/clients/components/ClientFormModal';
import {
  type ClientSearchParams,
  type ClientVo,
  searchClients,
} from '@admin/services/client';
import { PlusOutlined } from '@ant-design/icons';
import {
  PageContainer,
  type ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import { type ClientStatus, ClientSsoProtocol } from '@iam/contracts';
import { history, Link } from '@umijs/max';
import { Button, message, Tag } from 'antd';
import { useState } from 'react';

function editClient(clientCode: string) {
  history.push(`/clients/${encodeURIComponent(clientCode)}/edit?section=basic`);
}

export default function ClientsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const columns: ProColumns<ClientVo>[] = [
    {
      title: '应用',
      dataIndex: 'text',
      hideInTable: true,
      fieldProps: { placeholder: '应用编码或名称' },
    },
    { title: '应用编码', dataIndex: 'clientCode', width: 150, search: false },
    { title: '应用名称', dataIndex: 'clientName', width: 180, search: false },
    { title: '访问地址', dataIndex: 'url', ellipsis: true, search: false },
    {
      title: '全局状态',
      dataIndex: 'status',
      width: 110,
      valueType: 'select',
      render: (_, row) => <StatusTag domain="client" status={row.status} />,
    },
    {
      title: 'SSO 协议',
      dataIndex: 'ssoProtocol',
      valueType: 'select',
      valueEnum: { [ClientSsoProtocol.Oidc]: 'OIDC', [ClientSsoProtocol.CustomSso]: 'Custom SSO' },
      render: (_, row) => row.ssoConfig?.protocol ?? '未配置',
    },
    {
      title: 'SSO 启用',
      dataIndex: 'ssoEnabled',
      valueType: 'select',
      valueEnum: { true: '已启用', false: '已停用' },
      render: (_, row) => <Tag color={row.ssoEnabled ? 'green' : 'default'}>{row.ssoEnabled ? '已启用' : '已停用'}</Tag>,
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
      fixed: 'right',
      valueType: 'option',
      width: 90,
      render: (_, row) => [
        <Link
          key="edit"
          to={`/clients/${encodeURIComponent(row.clientCode)}/edit?section=basic`}
        >
          编辑
        </Link>,
      ],
    },
  ];

  return (
    <PageContainer title="应用管理">
      <ProTable<ClientVo>
        rowKey="clientCode"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1300 }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              text: searchText,
              status,
              ssoProtocol,
              ssoEnabled,
            } = params;
            const text = String(searchText || '');
            const statusNumber =
              status === undefined || status === null || status === ''
                ? undefined
                : (Number(status) as ClientStatus);
            const query = {
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses:
                    statusNumber === undefined ? undefined : [statusNumber],
                  ssoProtocols: ssoProtocol ? [ssoProtocol as ClientSsoProtocol] : undefined,
                  ssoEnabled: ssoEnabled === undefined || ssoEnabled === '' ? undefined : String(ssoEnabled) === 'true',
                },
              },
            } satisfies ClientSearchParams;
            const data = await searchClients(query);
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
            onClick={() => setCreateOpen(true)}
          >
            新建应用
          </Button>,
        ]}
      />

      <ClientFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCommitted={(clientCode) => {
          setCreateOpen(false);
          history.push(
            `/clients/${encodeURIComponent(clientCode)}/edit?section=basic&committed=1`,
          );
        }}
        onSuccess={(client) => {
          setCreateOpen(false);
          editClient(client.clientCode);
        }}
      />
    </PageContainer>
  );
}
