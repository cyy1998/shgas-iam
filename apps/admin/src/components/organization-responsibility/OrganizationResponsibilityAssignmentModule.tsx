import AuditLogTable from "@admin/components/audit/AuditLogTable";
import styles from "@admin/components/detail/DetailDrawer.module.less";
import DetailHeaderActions from "@admin/components/detail/DetailHeaderActions";
import OrganizationTreeSelector from "@admin/components/OrganizationTreeSelector";
import {
  endOrganizationResponsibilityAssignment,
  getOrganizationResponsibilityAssignment,
  type OrganizationResponsibilityAssignmentLifecycle,
  type OrganizationResponsibilityAssignmentView,
  pauseOrganizationResponsibilityAssignment,
  resumeOrganizationResponsibilityAssignment,
  searchOrganizationResponsibilityAssignments,
} from "@admin/services/organization-responsibility";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { type ProColumns, ProTable } from "@ant-design/pro-components";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  type OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType,
  OrganizationResponsibilityAssignmentStatus,
  type OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import { useAccess } from "@umijs/max";
import {
  Alert,
  Button,
  Descriptions,
  type DescriptionsProps,
  Drawer,
  Input,
  message,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import OrganizationResponsibilityAssignmentFormModal from "./OrganizationResponsibilityAssignmentFormModal";
import OrganizationResponsibilityAssignmentLifecycleActions from "./OrganizationResponsibilityAssignmentLifecycleActions";
import toolbarStyles from "./OrganizationResponsibilityAssignmentToolbar.module.less";
import {
  formatOrganizationResponsibilityStatus,
  formatOrganizationResponsibilityType,
} from "./organizationResponsibilityPresentation";

const PAGE_SIZE = 20;

const lifecycleCommandHandlers = {
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause]: {
    mutate: pauseOrganizationResponsibilityAssignment,
    successMessage: "责任任命已暂停",
  },
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume]: {
    mutate: resumeOrganizationResponsibilityAssignment,
    successMessage: "责任任命已恢复",
  },
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End]: {
    mutate: endOrganizationResponsibilityAssignment,
    successMessage: "责任任命已结束",
  },
} satisfies Record<
  OrganizationResponsibilityAssignmentLifecycleCommandType,
  {
    mutate: (input: { id: number }) => Promise<unknown>;
    successMessage: string;
  }
>;

export type OrganizationResponsibilityAssignmentState = {
  targetOrganizationCode?: string;
  employmentId?: number;
  userText?: string;
  typeCode?: OrganizationResponsibilityTypeCode;
  lifecycle: OrganizationResponsibilityAssignmentLifecycle;
  assignmentId: number | null;
  pageNum?: number;
  pageSize?: number;
};

type Host =
  | {
      kind: "organization";
      targetOrganizationCode: string;
    }
  | {
      kind: "global";
      state: OrganizationResponsibilityAssignmentState;
      onStateChange: (state: OrganizationResponsibilityAssignmentState) => void;
    };

type AssignmentFilterValues = {
  targetOrganizationCode?: string;
  employmentId?: number;
  userText?: string;
  typeCode?: OrganizationResponsibilityTypeCode;
  lifecycle?: OrganizationResponsibilityAssignmentLifecycle;
};

function formatReference(label: string, isDelete: boolean) {
  return isDelete ? `${label}（已删除）` : label;
}

function formatOrganizationPath(path: OrganizationResponsibilityAssignmentView["targetOrganization"]["fullPath"]) {
  return path.map((organization) => formatReference(organization.orgName, organization.isDelete)).join(" / ");
}

function formatTime(value: string | Date) {
  return new Date(value instanceof Date ? value.getTime() : value).toLocaleString();
}

function assignmentColumns(onOpenDetail: (id: number) => void): ProColumns<OrganizationResponsibilityAssignmentView>[] {
  return [
    {
      title: "责任类型",
      dataIndex: "typeCode",
      valueType: "select",
      valueEnum: Object.fromEntries(
        ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => [type.code, { text: `${type.name}（${type.code}）` }]),
      ),
      render: (_, row) => formatOrganizationResponsibilityType(row.typeCode),
    },
    {
      title: "状态",
      dataIndex: "status",
      search: false,
      render: (_, row) => (
        <Tag
          color={
            row.status === OrganizationResponsibilityAssignmentStatus.Enable
              ? "green"
              : row.status === OrganizationResponsibilityAssignmentStatus.Pause
                ? "gold"
                : "default"
          }
        >
          {formatOrganizationResponsibilityStatus(row.status)}
        </Tag>
      ),
    },
    {
      title: "用户",
      dataIndex: "userText",
      fieldProps: { placeholder: "输入姓名或账号", maxLength: 128 },
      render: (_, row) =>
        formatReference(`${row.holder.user.name}（${row.holder.user.username}）`, row.holder.user.isDelete),
    },
    {
      title: "任职组织路径",
      search: false,
      render: (_, row) => formatOrganizationPath(row.holder.organization.fullPath),
    },
    {
      title: "目标组织路径",
      search: false,
      render: (_, row) => formatOrganizationPath(row.targetOrganization.fullPath),
    },
    {
      title: "岗位",
      search: false,
      render: (_, row) =>
        formatReference(
          `${row.holder.position.posName}（${row.holder.position.posCode}）`,
          row.holder.position.isDelete,
        ),
    },
    {
      title: "操作",
      key: "actions",
      valueType: "option",
      fixed: "right",
      width: 88,
      render: (_, row) => (
        <Button type="link" onClick={() => onOpenDetail(row.id)}>
          详情
        </Button>
      ),
    },
  ];
}

function assignmentDetailItems(detail: OrganizationResponsibilityAssignmentView): DescriptionsProps["items"] {
  return [
    {
      key: "type",
      label: "责任类型",
      style: { width: "50%" },
      children: formatOrganizationResponsibilityType(detail.typeCode, { includeCode: false }),
    },
    {
      key: "target",
      label: "目标组织",
      style: { width: "50%" },
      children: formatReference(
        `${detail.targetOrganization.orgName}（${detail.targetOrganization.orgCode}）`,
        detail.targetOrganization.isDelete,
      ),
    },
    {
      key: "target-path",
      label: "目标组织路径",
      span: "filled",
      children: formatOrganizationPath(detail.targetOrganization.fullPath),
    },
    {
      key: "start-time",
      label: "生效时间",
      children: formatTime(detail.startTime),
    },
    {
      key: "end-time",
      label: "结束时间",
      children: detail.endTime === null ? "—" : formatTime(detail.endTime),
    },
  ];
}

function holderItems(detail: OrganizationResponsibilityAssignmentView): DescriptionsProps["items"] {
  return [
    {
      key: "user",
      label: "持有人",
      style: { width: "50%" },
      children: formatReference(
        `${detail.holder.user.name}（${detail.holder.user.username}）`,
        detail.holder.user.isDelete,
      ),
    },
    {
      key: "position",
      label: "岗位",
      style: { width: "50%" },
      children: formatReference(
        `${detail.holder.position.posName}（${detail.holder.position.posCode}）`,
        detail.holder.position.isDelete,
      ),
    },
    {
      key: "org-path",
      label: "任职组织路径",
      span: "filled",
      children: formatOrganizationPath(detail.holder.organization.fullPath),
    },
  ];
}

function assignmentMatchesFilters(
  assignment: OrganizationResponsibilityAssignmentView,
  filters: OrganizationResponsibilityAssignmentState,
) {
  if (filters.targetOrganizationCode && assignment.targetOrganization.orgCode !== filters.targetOrganizationCode) {
    return false;
  }
  if (filters.employmentId && assignment.holder.employmentId !== filters.employmentId) {
    return false;
  }
  if (filters.typeCode && assignment.typeCode !== filters.typeCode) return false;
  if (filters.userText) {
    const keyword = filters.userText.toLowerCase();
    if (
      !assignment.holder.user.name.toLowerCase().includes(keyword) &&
      !assignment.holder.user.username.toLowerCase().includes(keyword)
    )
      return false;
  }
  if (filters.lifecycle === "all") return true;
  const isOpen =
    assignment.status === OrganizationResponsibilityAssignmentStatus.Enable ||
    assignment.status === OrganizationResponsibilityAssignmentStatus.Pause;
  return filters.lifecycle === "open" ? isOpen : !isOpen;
}

export default function OrganizationResponsibilityAssignmentModule({ host }: { host: Host }) {
  const access = useAccess();
  const { token } = theme.useToken();
  const fixedTarget = host.kind === "organization" ? host.targetOrganizationCode : undefined;
  const initialState: OrganizationResponsibilityAssignmentState =
    host.kind === "global"
      ? host.state
      : {
          targetOrganizationCode: fixedTarget,
          lifecycle: "open" as const,
          assignmentId: null,
        };
  const [filters, setFilters] = useState<OrganizationResponsibilityAssignmentState>(initialState);
  const [searchText, setSearchText] = useState(initialState.userText ?? "");
  const [items, setItems] = useState<OrganizationResponsibilityAssignmentView[]>([]);
  const [pagination, setPagination] = useState({
    current: initialState.pageNum ?? 1,
    pageSize: initialState.pageSize ?? PAGE_SIZE,
    total: 0,
  });
  const paginationRef = useRef(pagination);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrganizationResponsibilityAssignmentView | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [auditRevision, setAuditRevision] = useState(0);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const loadPage = useCallback(
    async (
      pageNum = paginationRef.current.current,
      pageSize = paginationRef.current.pageSize,
      options: { preserveOnError?: boolean } = {},
    ) => {
      const requestId = ++listRequestIdRef.current;
      setLoading(true);
      try {
        const query = {
          ...(filters.targetOrganizationCode
            ? {
                targetOrganizationCode: filters.targetOrganizationCode,
              }
            : {}),
          ...(filters.employmentId ? { employmentId: filters.employmentId } : {}),
          ...(filters.userText ? { userText: filters.userText } : {}),
          ...(filters.typeCode ? { typeCode: filters.typeCode } : {}),
          lifecycle: filters.lifecycle,
          pageSize,
        };
        let page = await searchOrganizationResponsibilityAssignments({
          ...query,
          pageNum,
        });
        if (requestId !== listRequestIdRef.current) return;
        const lastPage = Math.max(1, Math.ceil((page.total ?? 0) / pageSize));
        if (pageNum > lastPage) {
          pageNum = lastPage;
          page = await searchOrganizationResponsibilityAssignments({
            ...query,
            pageNum,
          });
        }
        if (requestId !== listRequestIdRef.current) return;
        setItems(page.items);
        paginationRef.current = {
          current: pageNum,
          pageSize,
          total: page.total ?? 0,
        };
        setPagination(paginationRef.current);
      } catch (error) {
        if (requestId !== listRequestIdRef.current) return;
        if (!options.preserveOnError) {
          setItems([]);
          paginationRef.current = { current: pageNum, pageSize, total: 0 };
          setPagination(paginationRef.current);
        }
        message.error(error instanceof Error ? error.message : "加载责任任命失败");
      } finally {
        if (requestId === listRequestIdRef.current) setLoading(false);
      }
    },
    [filters.employmentId, filters.lifecycle, filters.targetOrganizationCode, filters.typeCode, filters.userText],
  );

  const loadDetail = useCallback(
    async (
      id: number,
      options: {
        allowOutOfScope?: boolean;
        preserveCurrent?: boolean;
      } = {},
    ) => {
      const requestId = ++detailRequestIdRef.current;
      if (!options.preserveCurrent) setDetail(null);
      setDetailError(null);
      setDetailOpen(true);
      setDetailLoading(true);
      try {
        const nextDetail = await getOrganizationResponsibilityAssignment({
          ...(fixedTarget ? { orgCode: fixedTarget } : {}),
          id,
        });
        if (requestId !== detailRequestIdRef.current) return;
        if (!options.allowOutOfScope && !assignmentMatchesFilters(nextDetail, filters)) {
          throw new Error("任命不属于当前链接筛选范围");
        }
        setDetail(nextDetail);
      } catch (error) {
        if (requestId !== detailRequestIdRef.current) return;
        setDetail(null);
        const errorMessage = error instanceof Error ? error.message : "加载责任任命详情失败";
        setDetailError(errorMessage);
        message.error(errorMessage);
      } finally {
        if (requestId === detailRequestIdRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [filters, fixedTarget],
  );

  useEffect(() => {
    let cancelled = false;
    void loadPage(filters.pageNum ?? 1, filters.pageSize ?? PAGE_SIZE).then(() => {
      if (!cancelled && initialState.assignmentId) {
        void loadDetail(initialState.assignmentId);
      }
    });
    return () => {
      cancelled = true;
      listRequestIdRef.current += 1;
      detailRequestIdRef.current += 1;
    };
  }, [initialState.assignmentId, filters.pageNum, filters.pageSize, loadDetail, loadPage]);

  const applyFilters = (values: AssignmentFilterValues) => {
    const nextState: OrganizationResponsibilityAssignmentState = {
      ...(fixedTarget
        ? { targetOrganizationCode: fixedTarget }
        : values.targetOrganizationCode
          ? { targetOrganizationCode: values.targetOrganizationCode }
          : {}),
      ...(values.employmentId ? { employmentId: values.employmentId } : {}),
      ...(values.typeCode ? { typeCode: values.typeCode } : {}),
      ...(values.userText?.trim() ? { userText: values.userText.trim() } : {}),
      lifecycle: values.lifecycle ?? "open",
      assignmentId: null,
    };
    setFilters(nextState);
    if (host.kind === "global") host.onStateChange(nextState);
  };

  const updateFilters = (values: AssignmentFilterValues) => applyFilters({ ...filters, ...values });

  const resetFilters = () => {
    setSearchText("");
    const nextState: OrganizationResponsibilityAssignmentState = {
      ...(fixedTarget ? { targetOrganizationCode: fixedTarget } : {}),
      lifecycle: "open",
      assignmentId: null,
    };
    setFilters(nextState);
    if (host.kind === "global") host.onStateChange(nextState);
  };

  const openDetail = (id: number) => {
    if (host.kind === "global") {
      host.onStateChange({
        ...filters,
        assignmentId: id,
        pageNum: pagination.current,
        pageSize: pagination.pageSize,
      });
      return;
    }
    void loadDetail(id);
  };

  const closeDetail = () => {
    detailRequestIdRef.current += 1;
    setDetailOpen(false);
    setDetailLoading(false);
    setDetail(null);
    setDetailError(null);
    if (host.kind === "global" && filters.assignmentId !== null) {
      host.onStateChange({ ...filters, assignmentId: null });
    }
  };

  const runLifecycleCommand = async (command: OrganizationResponsibilityAssignmentLifecycleCommandType) => {
    if (detail === null || lifecycleLoading) return;
    const assignmentId = detail.id;
    const handler = lifecycleCommandHandlers[command];
    setLifecycleLoading(true);
    try {
      const outcome = await handler.mutate({ id: assignmentId });
      if (outcome.changed) message.success(handler.successMessage);
      else message.info("无需修改");
      setAuditRevision((current) => current + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "责任任命操作失败");
    } finally {
      await Promise.all([
        loadPage(undefined, undefined, { preserveOnError: true }),
        loadDetail(assignmentId, {
          allowOutOfScope: true,
          preserveCurrent: true,
        }),
      ]);
      setLifecycleLoading(false);
    }
  };

  return (
    <>
      <ProTable<OrganizationResponsibilityAssignmentView, AssignmentFilterValues>
        className="iam-admin-list"
        defaultSize="small"
        rowKey="id"
        loading={loading}
        columns={assignmentColumns(openDetail)}
        dataSource={items}
        headerTitle={
          <div className={toolbarStyles.toolbar}>
            <div className="iam-admin-filters">
              <Input.Search
                className={toolbarStyles.search}
                aria-label="搜索责任用户"
                placeholder="搜索姓名或账号"
                maxLength={128}
                allowClear
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onSearch={(userText) => updateFilters({ userText })}
              />
              {!fixedTarget && (
                <fieldset className={toolbarStyles.organization} aria-label="目标组织">
                  <OrganizationTreeSelector
                    visibleStatuses={[OrganizationStatus.Enable, OrganizationStatus.Pause, OrganizationStatus.Disable]}
                    selectableStatuses={[
                      OrganizationStatus.Enable,
                      OrganizationStatus.Pause,
                      OrganizationStatus.Disable,
                    ]}
                    placeholder="全部目标组织"
                    value={filters.targetOrganizationCode}
                    onChange={(targetOrganizationCode) => updateFilters({ targetOrganizationCode })}
                  />
                </fieldset>
              )}
              <Select
                className={toolbarStyles.type}
                aria-label="责任类型"
                placeholder="全部责任类型"
                allowClear
                value={filters.typeCode}
                options={ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => ({
                  value: type.code,
                  label: type.name,
                }))}
                onChange={(typeCode) => updateFilters({ typeCode })}
              />
              <Select
                className={toolbarStyles.lifecycle}
                aria-label="生命周期"
                value={filters.lifecycle}
                options={[
                  { value: "open", label: "进行中" },
                  { value: "ended", label: "已结束" },
                  { value: "all", label: "全部生命周期" },
                ]}
                onChange={(lifecycle) => updateFilters({ lifecycle })}
              />
              {filters.employmentId && (
                <Tag
                  className={toolbarStyles["employment-scope"]}
                  closeIcon={<CloseOutlined aria-label="清除任职筛选" />}
                  styles={{ close: { padding: 4 } }}
                  onClose={() => updateFilters({ employmentId: undefined })}
                >
                  已限定任职
                </Tag>
              )}
              {(filters.userText ||
                (!fixedTarget && filters.targetOrganizationCode) ||
                filters.typeCode ||
                filters.employmentId ||
                filters.lifecycle !== "open") && (
                <Button type="text" onClick={resetFilters}>
                  清除筛选
                </Button>
              )}
            </div>
          </div>
        }
        search={false}
        options={{ reload: () => void loadPage(undefined, undefined, { preserveOnError: true }) }}
        scroll={{ x: 1200 }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (current, pageSize) =>
            void loadPage(pageSize === pagination.pageSize ? current : 1, pageSize, { preserveOnError: true }),
        }}
        toolBarRender={() =>
          access.canCreateOrganizationResponsibility
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => setCreateOpen(true)}
                >
                  新建责任任命
                </Button>,
              ]
            : []
        }
        locale={{ emptyText: "无符合条件的责任任命" }}
      />

      {access.canCreateOrganizationResponsibility && (
        <OrganizationResponsibilityAssignmentFormModal
          open={createOpen}
          orgCode={fixedTarget}
          onOpenChange={setCreateOpen}
          onFailure={() => loadPage(undefined, undefined, { preserveOnError: true })}
          onSuccess={() => void loadPage(1)}
        />
      )}

      <Drawer
        title={
          detail ? (
            <Space size={6} wrap>
              <span>{formatReference(detail.targetOrganization.orgName, detail.targetOrganization.isDelete)}</span>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {formatOrganizationResponsibilityType(detail.typeCode, { includeCode: false })}
              </Typography.Text>
              <Tag
                color={
                  detail.status === OrganizationResponsibilityAssignmentStatus.Enable
                    ? "green"
                    : detail.status === OrganizationResponsibilityAssignmentStatus.Pause
                      ? "gold"
                      : "default"
                }
              >
                {formatOrganizationResponsibilityStatus(detail.status)}
              </Tag>
            </Space>
          ) : (
            "责任任命详情"
          )
        }
        open={detailOpen}
        loading={detailLoading}
        size={840}
        onClose={closeDetail}
        classNames={{ header: styles["drawer-header"], extra: styles["drawer-actions"] }}
        styles={{ header: { padding: "14px 20px" }, body: { padding: "16px 20px", background: token.colorBgLayout } }}
        extra={
          detail && (
            <DetailHeaderActions>
              <OrganizationResponsibilityAssignmentLifecycleActions
                loading={lifecycleLoading}
                allowedActions={detail.allowedActions}
                onCommand={runLifecycleCommand}
              />
            </DetailHeaderActions>
          )
        }
      >
        {detailError && <Alert type="error" showIcon message={detailError} />}
        {detail && (
          <Tabs
            items={[
              {
                key: "detail",
                label: "任命详情",
                children: (
                  <div className={styles.content}>
                    {[
                      { title: "任命信息", items: assignmentDetailItems(detail) },
                      { title: "持有人与任职", items: holderItems(detail) },
                    ].map((section) => (
                      <section
                        key={section.title}
                        aria-label={section.title}
                        className={`${styles.section} ${styles["basic-section"]}`}
                        style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                      >
                        <div className={styles["section-header"]}>
                          <Typography.Title level={5} className={styles["section-title"]}>
                            {section.title}
                          </Typography.Title>
                        </div>
                        <Descriptions
                          className={styles.descriptions}
                          size="middle"
                          column={{ xs: 1, sm: 2 }}
                          styles={{
                            label: { fontSize: 13 },
                            content: { fontSize: 14, lineHeight: "24px", overflowWrap: "anywhere" },
                          }}
                          items={section.items}
                        />
                      </section>
                    ))}
                  </div>
                ),
              },
              ...(access.canAccessAudit
                ? [
                    {
                      key: "audit",
                      label: "操作日志",
                      forceRender: true,
                      children: (
                        <section
                          aria-label="操作日志"
                          className={styles.section}
                          style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                        >
                          <AuditLogTable
                            key={`${detail.id}:${auditRevision}`}
                            fixedConditions={{
                              targetType: "organization_responsibility_assignment",
                              targetId: detail.id,
                            }}
                            pageSize={10}
                            search={false}
                            size="small"
                          />
                        </section>
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
