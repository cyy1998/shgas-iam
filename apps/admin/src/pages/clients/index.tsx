import StatusTag from "@admin/components/StatusTag";
import ClientFormModal from "@admin/pages/clients/components/ClientFormModal";
import { type ClientSearchParams, type ClientVo, searchClients } from "@admin/services/client";
import { PlusOutlined } from "@ant-design/icons";
import { PageContainer, type ProColumns, ProTable } from "@ant-design/pro-components";
import { ClientSsoProtocol, type ClientStatus, getClientStatusOptions } from "@iam/contracts";
import { Button, Input, message, Select, Tag } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function ClientsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<{
    text?: string;
    status?: ClientStatus;
    ssoProtocol?: ClientSsoProtocol;
    ssoEnabled?: boolean;
  }>({});

  const handleError = (err: unknown) => message.error(err instanceof Error ? err.message : "操作失败");

  const columns: ProColumns<ClientVo>[] = [
    { title: "应用编码", dataIndex: "clientCode", width: 150, search: false },
    { title: "应用名称", dataIndex: "clientName", width: 180, search: false },
    { title: "访问地址", dataIndex: "url", ellipsis: true, search: false },
    {
      title: "全局状态",
      dataIndex: "status",
      width: 110,
      valueType: "select",
      valueEnum: Object.fromEntries(getClientStatusOptions().map((option) => [option.value, { text: option.label }])),
      render: (_, row) => <StatusTag domain="client" status={row.status} />,
    },
    {
      title: "SSO 协议",
      dataIndex: "ssoProtocol",
      valueType: "select",
      valueEnum: { [ClientSsoProtocol.Oidc]: "OIDC", [ClientSsoProtocol.CustomSso]: "Custom SSO" },
      render: (_, row) => row.ssoConfig?.protocol ?? "未配置",
    },
    {
      title: "SSO 启用",
      dataIndex: "ssoEnabled",
      valueType: "select",
      valueEnum: { true: "已启用", false: "已停用" },
      render: (_, row) => (
        <Tag color={row.ssoEnabled ? "green" : "default"}>{row.ssoEnabled ? "已启用" : "已停用"}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      width: 170,
      search: false,
      render: (_, row) => new Date(row.createTime).toLocaleString(),
    },
    {
      title: "操作",
      fixed: "right",
      valueType: "option",
      width: 90,
      render: (_, row) => [
        <Link key="edit" to={`/clients/${encodeURIComponent(row.clientCode)}/edit?section=basic`}>
          编辑
        </Link>,
      ],
    },
  ];

  return (
    <PageContainer title={false} breadcrumbRender={false}>
      <ProTable<ClientVo>
        className="iam-admin-list"
        defaultSize="small"
        rowKey="clientCode"
        columns={columns}
        search={false}
        params={filters}
        headerTitle={
          <div className="iam-admin-filters">
            <Input.Search
              className="iam-admin-search"
              aria-label="搜索应用"
              placeholder="搜索应用编码或名称"
              value={searchText}
              allowClear
              onChange={(event) => {
                setSearchText(event.target.value);
                if (!event.target.value) setFilters((current) => ({ ...current, text: undefined }));
              }}
              onSearch={(text) => setFilters((current) => ({ ...current, text: text.trim() || undefined }))}
            />
            <div className="iam-admin-filter-fields">
              <Select
                aria-label="全局状态"
                placeholder="全部状态"
                allowClear
                value={filters.status}
                options={getClientStatusOptions()}
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
              />
              <Select
                aria-label="SSO 协议"
                placeholder="全部协议"
                allowClear
                value={filters.ssoProtocol}
                options={[
                  { value: ClientSsoProtocol.Oidc, label: "OIDC" },
                  { value: ClientSsoProtocol.CustomSso, label: "Custom SSO" },
                ]}
                onChange={(ssoProtocol) => setFilters((current) => ({ ...current, ssoProtocol }))}
              />
              <Select
                aria-label="SSO 启用"
                placeholder="SSO 启用状态"
                allowClear
                value={filters.ssoEnabled?.toString()}
                options={[
                  { value: "true", label: "已启用" },
                  { value: "false", label: "已停用" },
                ]}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    ssoEnabled: value === undefined ? undefined : value === "true",
                  }))
                }
              />
            </div>
            {Object.values(filters).some((value) => value !== undefined) && (
              <Button
                type="text"
                onClick={() => {
                  setSearchText("");
                  setFilters({});
                }}
              >
                重置
              </Button>
            )}
          </div>
        }
        scroll={{ x: 1080 }}
        pagination={{ defaultPageSize: 20, hideOnSinglePage: true, showSizeChanger: true }}
        request={async (params) => {
          try {
            const { current = 1, pageSize = 20, text: searchText, status, ssoProtocol, ssoEnabled } = params;
            const text = String(searchText || "");
            const statusNumber =
              status === undefined || status === null || status === "" ? undefined : (Number(status) as ClientStatus);
            const query = {
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses: statusNumber === undefined ? undefined : [statusNumber],
                  ssoProtocols: ssoProtocol ? [ssoProtocol as ClientSsoProtocol] : undefined,
                  ssoEnabled: ssoEnabled === undefined || ssoEnabled === "" ? undefined : String(ssoEnabled) === "true",
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
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建应用
          </Button>,
        ]}
      />

      <ClientFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCommitted={(clientCode) => {
          setCreateOpen(false);
          void navigate(`/clients/${encodeURIComponent(clientCode)}/edit?section=basic&committed=1`);
        }}
        onSuccess={(client) => {
          setCreateOpen(false);
          void navigate(`/clients/${encodeURIComponent(client.clientCode)}/edit?section=basic`);
        }}
      />
    </PageContainer>
  );
}
