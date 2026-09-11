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
import {
  type ClientStatus,
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientState,
  OidcClientType,
  OidcScope,
} from '@iam/contracts';
import { history, Link } from '@umijs/max';
import { Button, message, Space, Tag } from 'antd';
import { useState } from 'react';

const customSsoStateLabels = {
  [CustomSsoClientState.Unconfigured]: '未配置',
  [CustomSsoClientState.Disabled]: '已禁用',
  [CustomSsoClientState.Enabled]: '已启用',
} as const;

const customSsoModeLabels = {
  [CustomSsoClientMode.Gateway]: 'Gateway',
  [CustomSsoClientMode.Independent]: 'Independent',
} as const;

const protocolStateColors = {
  unconfigured: 'default',
  disabled: 'orange',
  enabled: 'green',
} as const;

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
      title: 'Custom SSO',
      dataIndex: 'customSsoState',
      width: 210,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        Object.entries(customSsoStateLabels).map(([value, text]) => [
          value,
          { text },
        ]),
      ),
      render: (_, row) => (
        <Space size={4}>
          <Tag color={protocolStateColors[row.customSsoState]}>
            {customSsoStateLabels[row.customSsoState]}
          </Tag>
          {row.customSsoMode && (
            <Tag>{customSsoModeLabels[row.customSsoMode]}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Custom SSO 模式',
      dataIndex: 'customSsoMode',
      valueType: 'select',
      hideInTable: true,
      valueEnum: {
        [CustomSsoClientMode.Gateway]: { text: 'Gateway' },
        [CustomSsoClientMode.Independent]: { text: 'Independent' },
      },
    },
    {
      title: 'OIDC',
      dataIndex: 'oidcState',
      width: 140,
      valueType: 'select',
      valueEnum: {
        [OidcClientState.Unconfigured]: { text: '未配置' },
        [OidcClientState.Disabled]: { text: '已配置/禁用' },
        [OidcClientState.Enabled]: { text: '已启用' },
      },
      render: (_, row) => (
        <Tag color={protocolStateColors[row.oidcState]}>
          {
            {
              [OidcClientState.Unconfigured]: '未配置',
              [OidcClientState.Disabled]: '已禁用',
              [OidcClientState.Enabled]: '已启用',
            }[row.oidcState]
          }
        </Tag>
      ),
    },
    {
      title: 'OIDC Client 类型',
      dataIndex: 'oidcClientType',
      valueType: 'select',
      hideInTable: true,
      valueEnum: {
        [OidcClientType.Public]: { text: 'Public' },
        [OidcClientType.Confidential]: { text: 'Confidential' },
      },
    },
    {
      title: 'OIDC Scopes',
      dataIndex: 'oidcAllowedScopes',
      valueType: 'select',
      hideInTable: true,
      fieldProps: { mode: 'multiple' },
      valueEnum: {
        [OidcScope.OpenId]: { text: 'openid' },
        [OidcScope.Profile]: { text: 'profile' },
        [OidcScope.Phone]: { text: 'phone' },
        [OidcScope.IamEmployments]: { text: 'iam:employments' },
        [OidcScope.IamAuthorization]: { text: 'iam:authorization' },
      },
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
              customSsoState,
              customSsoMode,
              oidcState,
              oidcClientType,
              oidcAllowedScopes,
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
                  customSsoStates: customSsoState
                    ? [customSsoState as CustomSsoClientState]
                    : undefined,
                  customSsoModes: customSsoMode
                    ? [customSsoMode as CustomSsoClientMode]
                    : undefined,
                  oidcStates: oidcState
                    ? [oidcState as OidcClientState]
                    : undefined,
                  oidcClientTypes: oidcClientType
                    ? [oidcClientType as OidcClientType]
                    : undefined,
                  oidcAllowedScopes:
                    Array.isArray(oidcAllowedScopes) &&
                    oidcAllowedScopes.length > 0
                      ? (oidcAllowedScopes as OidcScope[])
                      : undefined,
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
