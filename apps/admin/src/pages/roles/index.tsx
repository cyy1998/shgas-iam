import StatusTag from "@admin/components/StatusTag";
import RoleDetailDrawer from "@admin/pages/roles/components/RoleDetailDrawer";
import RoleFormModal from "@admin/pages/roles/components/RoleFormModal";
import { requestClientOptions } from "@admin/pages/roles/role-selectors";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { deleteRole, type RoleVo, searchRoles, updateRoleStatus } from "@admin/services/role";
import { PlusOutlined } from "@ant-design/icons";
import { type ActionType, PageContainer, type ProColumns, ProFormSelect, ProTable } from "@ant-design/pro-components";
import {
  getRoleStatusOptions,
  type RoleKind,
  type RoleStatus,
  type RoleType,
  roleKindToString,
  roleTypeOptions,
  roleTypeToString,
} from "@iam/contracts";
import { Alert, Button, Dropdown, Input, Modal, message, Select } from "antd";
import { useRef, useState } from "react";

export default function RolesPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerRoleCode, setDrawerRoleCode] = useState<string | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<{
    text?: string;
    clientCode?: string;
    roleType?: RoleType;
    status?: RoleStatus;
  }>({});

  const [committedWarning, setCommittedWarning] = useState<string>();
  const [detailReloadSeq, setDetailReloadSeq] = useState(0);

  const onCommitted = (error: AdminMutationCommittedError, roleCode?: string) => {
    setCommittedWarning(error.message);
    setFormOpen(false);
    setDrawerEditing(false);
    if (roleCode) setDrawerRoleCode(roleCode);
    setDetailReloadSeq((value) => value + 1);
    void actionRef.current?.reload();
  };

  const handleError = (err: unknown) => message.error(err instanceof Error ? err.message : "操作失败");

  const reload = () => actionRef.current?.reload();

  const onCreate = () => {
    setFormOpen(true);
  };

  const onEdit = (row: RoleVo) => {
    setDrawerEditing(true);
    setDrawerRoleCode(row.roleCode);
  };

  const onDelete = (row: RoleVo) => {
    Modal.confirm({
      title: `删除角色 ${row.roleName}？`,
      content: "仅无分配对象的角色可以删除，删除后不会再出现在角色列表中。",
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await deleteRole(row.roleCode);
          message.success(outcome.changed ? "角色已删除" : "无需修改");
          reload();
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            onCommitted(err, row.roleCode);
          } else {
            handleError(err);
          }
        }
      },
    });
  };

  const onStatusChange = async (row: RoleVo, status: RoleStatus) => {
    try {
      const outcome = await updateRoleStatus(row.roleCode, status);
      message.success(outcome.changed ? "状态已更新" : "无需修改");
      reload();
    } catch (err) {
      if (err instanceof AdminMutationCommittedError) {
        onCommitted(err, row.roleCode);
      } else {
        handleError(err);
      }
    }
  };

  const columns: ProColumns<RoleVo>[] = [
    { title: "角色编码", dataIndex: "roleCode", width: 150, search: false },
    { title: "角色名称", dataIndex: "roleName", width: 160, search: false },
    {
      title: "角色形态",
      dataIndex: "roleKind",
      width: 100,
      search: false,
      renderText: (value: RoleKind) => roleKindToString[value],
    },
    {
      title: "角色归属",
      dataIndex: "roleType",
      width: 100,
      search: false,
      renderText: (value: RoleType) => roleTypeToString[value],
    },
    {
      title: "所属应用",
      dataIndex: "clientCode",
      width: 180,
      valueType: "select",
      request: requestClientOptions,
      fieldProps: {
        filterOption: false,
        placeholder: "输入应用名称或编码搜索",
        showSearch: true,
      },
      render: (_, row) => (row.client ? `${row.client.clientName}（${row.client.clientCode}）` : "无"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      valueType: "select",
      valueEnum: Object.fromEntries(getRoleStatusOptions().map((o) => [o.value, { text: o.label }])),
      render: (_, row) => <StatusTag domain="role" status={row.status} />,
    },
    {
      title: "分配数",
      dataIndex: "assignmentCount",
      width: 80,
      align: "right",
      search: false,
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
      width: 200,
      render: (_, row) => [
        <Button
          key="detail"
          type="link"
          size="small"
          style={{ paddingInline: 0 }}
          onClick={() => {
            setDrawerEditing(false);
            setDrawerRoleCode(row.roleCode);
          }}
        >
          详情
        </Button>,
        <Button key="edit" type="link" size="small" style={{ paddingInline: 0 }} onClick={() => onEdit(row)}>
          编辑
        </Button>,
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
          <Button type="link" size="small" style={{ paddingInline: 0 }}>
            状态
          </Button>
        </Dropdown>,
        <Button key="delete" type="link" size="small" danger style={{ paddingInline: 0 }} onClick={() => onDelete(row)}>
          删除
        </Button>,
      ],
    },
  ];

  return (
    <PageContainer title={false} breadcrumbRender={false}>
      {committedWarning && drawerRoleCode === null && <Alert type="warning" showIcon title={committedWarning} />}
      <ProTable<RoleVo>
        className="iam-admin-list"
        size="small"
        actionRef={actionRef}
        rowKey="roleCode"
        columns={columns}
        search={false}
        params={filters}
        headerTitle={
          <div className="iam-admin-filters">
            <Input.Search
              className="iam-admin-search"
              aria-label="搜索角色"
              placeholder="搜索角色编码或名称"
              value={searchText}
              allowClear
              onChange={(event) => {
                setSearchText(event.target.value);
                if (!event.target.value) setFilters((current) => ({ ...current, text: undefined }));
              }}
              onSearch={(text) => setFilters((current) => ({ ...current, text: text.trim() || undefined }))}
            />
            <div className="iam-admin-filter-fields">
              <ProFormSelect
                noStyle
                request={requestClientOptions}
                debounceTime={300}
                fieldProps={{
                  "aria-label": "所属应用",
                  placeholder: "全部应用",
                  allowClear: true,
                  showSearch: true,
                  filterOption: false,
                  value: filters.clientCode,
                  onChange: (clientCode) => setFilters((current) => ({ ...current, clientCode })),
                }}
              />
              <Select
                aria-label="角色归属"
                placeholder="全部归属"
                allowClear
                value={filters.roleType}
                options={roleTypeOptions}
                onChange={(roleType) => setFilters((current) => ({ ...current, roleType }))}
              />
              <Select
                aria-label="角色状态"
                placeholder="全部状态"
                allowClear
                value={filters.status}
                options={getRoleStatusOptions()}
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
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
        scroll={{ x: 1240 }}
        pagination={{ defaultPageSize: 20, hideOnSinglePage: true, showSizeChanger: true }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              text,
              clientCode,
              roleType,
              status,
            } = params as {
              current?: number;
              pageSize?: number;
              text?: string;
              clientCode?: string;
              roleType?: RoleType;
              status?: string | number;
            };
            const statusValue = status === undefined ? undefined : (Number(status) as RoleStatus);
            const data = await searchRoles({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  clientCode: clientCode || undefined,
                  roleType,
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
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建角色
          </Button>,
        ]}
      />
      <RoleFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onCommitted={onCommitted}
        onSuccess={(roleCode) => {
          setDrawerEditing(false);
          setDrawerRoleCode(roleCode);
          setFormOpen(false);
          reload();
        }}
      />
      <RoleDetailDrawer
        open={drawerRoleCode !== null}
        roleCode={drawerRoleCode}
        initialEditing={drawerEditing}
        committedWarning={committedWarning}
        onOpenChange={(open) => {
          if (!open) setDrawerRoleCode(null);
        }}
        onChanged={reload}
        reloadSeq={detailReloadSeq}
        onCommitted={(error) => setCommittedWarning(error.message)}
      />
    </PageContainer>
  );
}
