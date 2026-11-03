import OrganizationTreeSelector from "@admin/components/OrganizationTreeSelector";
import StatusTag from "@admin/components/StatusTag";
import EmploymentDetailDrawer from "@admin/pages/employments/components/EmploymentDetailDrawer";
import EmploymentFormModal from "@admin/pages/employments/components/EmploymentFormModal";
import { type EmploymentVo, searchEmployments } from "@admin/services/employment";
import { PlusOutlined } from "@ant-design/icons";
import { type ActionType, PageContainer, type ProColumns, ProTable } from "@ant-design/pro-components";
import { EmploymentStatus, getEmploymentStatusOptions } from "@iam/contracts";
import { useAccess, useLocation } from "@umijs/max";
import { Alert, Button, Input, message, Select, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

type PresetFromUrl = {
  username?: string;
  name?: string;
  employmentId?: number;
};

type EmploymentFilters = {
  userText?: string;
  organizationOrgCode?: string;
  isPrimary?: boolean;
  status?: EmploymentStatus;
};

function parseQuery(search: string): PresetFromUrl {
  const params = new URLSearchParams(search);
  const username = params.get("username");
  const name = params.get("name");
  const employmentId = Number(params.get("employmentId"));
  return {
    ...(username ? { username, name: name ?? undefined } : {}),
    ...(Number.isInteger(employmentId) && employmentId > 0 ? { employmentId } : {}),
  };
}

function formatOrgPath(row: EmploymentVo) {
  const path = row.organization?.fullOrgPath?.map((node) => node.orgName).join(" / ");
  return path || row.organization?.assignedOrg?.orgName || "—";
}

function formatUser(row: EmploymentVo) {
  return `${row.user.name} (${row.user.username})`;
}

function formatPosition(row: EmploymentVo) {
  return `${row.position.posName} (${row.position.posCode})`;
}

export default function EmploymentsPage() {
  const access = useAccess();
  const [committedWarning, setCommittedWarning] = useState<string>();
  const actionRef = useRef<ActionType>(undefined);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<EmploymentFilters>({});
  const searchOrgCodeRef = useRef<string | undefined>(undefined);
  const location = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [formPresetUsername, setFormPresetUsername] = useState<string | null>(null);
  const [formPresetName, setFormPresetName] = useState<string | null>(null);
  const [formPresetOrgCode, setFormPresetOrgCode] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  useEffect(() => {
    searchOrgCodeRef.current = filters.organizationOrgCode;
  }, [filters.organizationOrgCode]);

  const getSearchOrgCode = useCallback(() => searchOrgCodeRef.current || null, []);

  // URL presets open either Employment detail or the create modal.
  useEffect(() => {
    const preset = parseQuery(location.search);
    // The route query is an external navigation source. Hydrate its UI snapshot
    // together so the requested destination opens consistently.
    if (preset.employmentId && access.canAccessEmployment) {
      setDrawerId(preset.employmentId);
    }
    if (preset.username && access.canCreateEmployment) {
      setFormPresetUsername(preset.username);
      setFormPresetName(preset.name ?? null);
      setFormPresetOrgCode(getSearchOrgCode());
      setFormOpen(true);
    }
  }, [access.canAccessEmployment, access.canCreateEmployment, getSearchOrgCode, location.search]);

  const handleError = (err: unknown) => message.error(err instanceof Error ? err.message : "操作失败");

  const columns: ProColumns<EmploymentVo>[] = [
    {
      title: "用户",
      dataIndex: "userText",
      render: (_, r) => formatUser(r),
      width: 160,
      fieldProps: { placeholder: "工号或姓名", maxLength: 128 },
    },
    {
      title: "组织",
      dataIndex: "organizationOrgCode",
      hideInTable: true,
      formItemRender: () => <OrganizationTreeSelector placeholder="请选择组织范围" />,
    },
    {
      title: "组织路径",
      dataIndex: ["organization", "assignedOrg", "orgName"],
      width: 260,
      search: false,
      render: (_, r) => formatOrgPath(r),
    },
    {
      title: "岗位",
      dataIndex: ["position", "posName"],
      width: 140,
      search: false,
      render: (_, r) => formatPosition(r),
    },
    {
      title: "主岗",
      dataIndex: "isPrimary",
      width: 80,
      valueEnum: {
        true: { text: "是" },
        false: { text: "否" },
      },
      render: (_, r) => (r.isPrimary ? <Tag>主岗</Tag> : null),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      valueType: "select",
      valueEnum: Object.fromEntries(getEmploymentStatusOptions().map((o) => [o.value, { text: o.label }])),
      render: (_, r) => <StatusTag domain="employment" status={r.status} />,
    },
    {
      title: "起止时间",
      dataIndex: "startTime",
      width: 200,
      search: false,
      render: (_, r) => (
        <span>
          {new Date(r.startTime).toLocaleDateString()}
          {" ~ "}
          {r.endTime ? new Date(r.endTime).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      title: "操作",
      fixed: "right",
      valueType: "option",
      width: 80,
      render: (_, row) => [
        <Button key="view" type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setDrawerId(row.id)}>
          查看
        </Button>,
      ],
    },
  ];

  return (
    <PageContainer title={false} breadcrumbRender={false}>
      {committedWarning && <Alert type="warning" showIcon title={committedWarning} />}
      <ProTable<EmploymentVo>
        className="iam-admin-list"
        size="small"
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        params={filters}
        headerTitle={
          <div className="iam-admin-filters">
            <Input.Search
              className="iam-admin-search"
              aria-label="搜索雇佣用户"
              placeholder="搜索工号或姓名"
              maxLength={128}
              allowClear
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onSearch={(value) => setFilters((current) => ({ ...current, userText: value.trim() || undefined }))}
            />
            <div className="iam-admin-filter-fields">
              <fieldset style={{ width: 180, minWidth: 0, margin: 0, padding: 0, border: 0 }} aria-label="组织范围">
                <OrganizationTreeSelector
                  placeholder="全部组织"
                  value={filters.organizationOrgCode}
                  onChange={(organizationOrgCode) => setFilters((current) => ({ ...current, organizationOrgCode }))}
                />
              </fieldset>
              <Select
                aria-label="主岗筛选"
                placeholder="全部岗位"
                allowClear
                value={filters.isPrimary === undefined ? undefined : String(filters.isPrimary)}
                options={[
                  { label: "主岗", value: "true" },
                  { label: "非主岗", value: "false" },
                ]}
                onChange={(value: string | undefined) =>
                  setFilters((current) => ({
                    ...current,
                    isPrimary: value === undefined ? undefined : value === "true",
                  }))
                }
              />
              <Select
                aria-label="雇佣状态"
                placeholder="在职与暂停"
                allowClear
                value={filters.status}
                options={getEmploymentStatusOptions()}
                onChange={(status: EmploymentStatus | undefined) => setFilters((current) => ({ ...current, status }))}
              />
            </div>
            {(filters.userText ||
              filters.organizationOrgCode ||
              filters.isPrimary !== undefined ||
              filters.status !== undefined) && (
              <Button
                type="link"
                onClick={() => {
                  setSearchText("");
                  setFilters({});
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        }
        scroll={{ x: 1200 }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              userText,
              status,
              isPrimary,
              organizationOrgCode,
            } = params as {
              current?: number;
              pageSize?: number;
              userText?: string;
              status?: string | number;
              isPrimary?: "true" | "false" | boolean;
              organizationOrgCode?: string;
            };
            const text = (userText ?? "").trim();
            const statusNum =
              status === undefined || status === null || status === ""
                ? undefined
                : (Number(status) as EmploymentStatus);
            const isPrimaryBool =
              isPrimary === undefined ? undefined : typeof isPrimary === "boolean" ? isPrimary : isPrimary === "true";
            const data = await searchEmployments({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { userText: text } : {},
                exactConditions: {
                  statuses: statusNum !== undefined ? [statusNum] : [EmploymentStatus.Enable, EmploymentStatus.Pause],
                  isPrimary: isPrimaryBool,
                  organization: organizationOrgCode
                    ? { orgCodes: [organizationOrgCode], matchMode: "subtree" }
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
        toolBarRender={() =>
          access.canCreateEmployment
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => {
                    setFormPresetUsername(null);
                    setFormPresetOrgCode(getSearchOrgCode());
                    setFormOpen(true);
                  }}
                >
                  新增雇佣
                </Button>,
              ]
            : []
        }
      />

      <EmploymentFormModal
        onCommitted={async (error) => {
          setCommittedWarning(error.message);
          setFormOpen(false);
          await actionRef.current?.reload();
        }}
        open={formOpen}
        presetUsername={formPresetUsername}
        presetName={formPresetName}
        presetOrgCode={formPresetOrgCode}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setFormPresetUsername(null);
            setFormPresetName(null);
            setFormPresetOrgCode(null);
          }
        }}
        onSuccess={() => {
          setFormOpen(false);
          setFormPresetUsername(null);
          setFormPresetName(null);
          setFormPresetOrgCode(null);
          actionRef.current?.reload();
        }}
      />

      <EmploymentDetailDrawer
        open={drawerId !== null}
        employmentId={drawerId}
        onClose={() => setDrawerId(null)}
        onChanged={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
}
