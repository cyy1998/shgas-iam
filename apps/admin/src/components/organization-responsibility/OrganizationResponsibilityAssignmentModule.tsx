import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import AuditLogTable from '@admin/components/audit/AuditLogTable';
import { requestEmploymentOptionsWithoutId } from '@admin/components/employment-select-options';
import {
  endOrganizationResponsibilityAssignment,
  getOrganizationResponsibilityAssignment,
  pauseOrganizationResponsibilityAssignment,
  resumeOrganizationResponsibilityAssignment,
  searchOrganizationResponsibilityAssignments,
  type OrganizationResponsibilityAssignmentLifecycle,
  type OrganizationResponsibilityAssignmentView,
} from '@admin/services/organization-responsibility';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationStatus,
  type OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType,
  type OrganizationResponsibilityTypeCode,
} from '@iam/contracts';
import { Alert, Button, Descriptions, Drawer, message, Tabs, Tag } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import OrganizationResponsibilityAssignmentFormModal from './OrganizationResponsibilityAssignmentFormModal';
import OrganizationResponsibilityAssignmentLifecycleActions from './OrganizationResponsibilityAssignmentLifecycleActions';
import {
  formatOrganizationResponsibilityStatus,
  formatOrganizationResponsibilityType,
} from './organizationResponsibilityPresentation';

const PAGE_SIZE = 20;

const lifecycleCommandHandlers = {
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause]: {
    mutate: pauseOrganizationResponsibilityAssignment,
    successMessage: '责任任命已暂停',
  },
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume]: {
    mutate: resumeOrganizationResponsibilityAssignment,
    successMessage: '责任任命已恢复',
  },
  [ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End]: {
    mutate: endOrganizationResponsibilityAssignment,
    successMessage: '责任任命已结束',
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
  typeCode?: OrganizationResponsibilityTypeCode;
  lifecycle: OrganizationResponsibilityAssignmentLifecycle;
  assignmentId: number | null;
};

type Host =
  | {
      kind: 'organization';
      targetOrganizationCode: string;
    }
  | {
      kind: 'global';
      state: OrganizationResponsibilityAssignmentState;
      onStateChange: (state: OrganizationResponsibilityAssignmentState) => void;
    };

type AssignmentSearchFormValues = {
  targetOrganizationCode?: string;
  employmentId?: number | { value: number };
  typeCode?: OrganizationResponsibilityTypeCode;
  lifecycle?: OrganizationResponsibilityAssignmentLifecycle;
};

function formatOrganizationPath(path: ReadonlyArray<{ orgName: string }>) {
  return path.map((organization) => organization.orgName).join(' / ');
}

function formatTime(value: string | Date) {
  return new Date(
    value instanceof Date ? value.getTime() : value,
  ).toLocaleString();
}

function assignmentColumns(
  onOpenDetail: (id: number) => void,
  fixedTarget?: string,
): ProColumns<OrganizationResponsibilityAssignmentView>[] {
  return [
    {
      title: '目标组织',
      dataIndex: 'targetOrganizationCode',
      hideInTable: true,
      search: fixedTarget ? false : undefined,
      formItemRender: () => (
        <OrganizationTreeSelector
          visibleStatuses={[
            OrganizationStatus.Enable,
            OrganizationStatus.Pause,
            OrganizationStatus.Disable,
          ]}
          selectableStatuses={[
            OrganizationStatus.Enable,
            OrganizationStatus.Pause,
            OrganizationStatus.Disable,
          ]}
          placeholder="全部目标组织"
        />
      ),
    },
    {
      title: '任职',
      dataIndex: 'employmentId',
      hideInTable: true,
      valueType: 'select',
      request: requestEmploymentOptionsWithoutId,
      fieldProps: {
        filterOption: false,
        labelInValue: true,
        placeholder: '搜索用户、账号、组织或岗位',
        showSearch: true,
      },
    },
    {
      title: '责任类型',
      dataIndex: 'typeCode',
      valueType: 'select',
      valueEnum: Object.fromEntries(
        ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => [
          type.code,
          { text: `${type.name}（${type.code}）` },
        ]),
      ),
      render: (_, row) => formatOrganizationResponsibilityType(row.typeCode),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (_, row) => (
        <Tag
          color={
            row.status === OrganizationResponsibilityAssignmentStatus.Enable
              ? 'green'
              : row.status === OrganizationResponsibilityAssignmentStatus.Pause
                ? 'gold'
                : 'default'
          }
        >
          {formatOrganizationResponsibilityStatus(row.status)}
        </Tag>
      ),
    },
    {
      title: '生命周期',
      dataIndex: 'lifecycle',
      hideInTable: true,
      valueType: 'select',
      valueEnum: {
        open: { text: '进行中' },
        ended: { text: '已结束' },
        all: { text: '全部' },
      },
    },
    {
      title: '用户',
      render: (_, row) =>
        `${row.holder.user.name}（${row.holder.user.username}）`,
    },
    {
      title: '任职组织路径',
      render: (_, row) =>
        formatOrganizationPath(row.holder.organization.fullPath),
    },
    {
      title: '目标组织路径',
      render: (_, row) =>
        formatOrganizationPath(row.targetOrganization.fullPath),
    },
    {
      title: '岗位',
      render: (_, row) =>
        `${row.holder.position.posName}（${row.holder.position.posCode}）`,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 88,
      render: (_, row) => (
        <Button type="link" onClick={() => onOpenDetail(row.id)}>
          详情
        </Button>
      ),
    },
  ];
}

function detailItems(detail: OrganizationResponsibilityAssignmentView) {
  return [
    {
      key: 'type',
      label: '责任类型',
      children: formatOrganizationResponsibilityType(detail.typeCode),
    },
    {
      key: 'target',
      label: '目标组织',
      children: `${detail.targetOrganization.orgName}（${detail.targetOrganization.orgCode}）`,
    },
    {
      key: 'target-path',
      label: '目标组织路径',
      children: formatOrganizationPath(detail.targetOrganization.fullPath),
    },
    {
      key: 'status',
      label: '状态',
      children: formatOrganizationResponsibilityStatus(detail.status),
    },
    {
      key: 'start-time',
      label: '生效时间',
      children: formatTime(detail.startTime),
    },
    {
      key: 'end-time',
      label: '结束时间',
      children: detail.endTime === null ? '—' : formatTime(detail.endTime),
    },
    {
      key: 'user',
      label: '持有人',
      children: `${detail.holder.user.name}（${detail.holder.user.username}）`,
    },
    {
      key: 'org-path',
      label: '任职组织路径',
      children: formatOrganizationPath(detail.holder.organization.fullPath),
    },
    {
      key: 'position',
      label: '岗位',
      children: `${detail.holder.position.posName}（${detail.holder.position.posCode}）`,
    },
    {
      key: 'employment-id',
      label: '任职 ID',
      children: `#${detail.holder.employmentId}`,
    },
  ];
}

function assignmentMatchesFilters(
  assignment: OrganizationResponsibilityAssignmentView,
  filters: OrganizationResponsibilityAssignmentState,
) {
  if (
    filters.targetOrganizationCode &&
    assignment.targetOrganization.orgCode !== filters.targetOrganizationCode
  ) {
    return false;
  }
  if (
    filters.employmentId &&
    assignment.holder.employmentId !== filters.employmentId
  ) {
    return false;
  }
  if (filters.typeCode && assignment.typeCode !== filters.typeCode)
    return false;
  if (filters.lifecycle === 'all') return true;
  const isOpen =
    assignment.status === OrganizationResponsibilityAssignmentStatus.Enable ||
    assignment.status === OrganizationResponsibilityAssignmentStatus.Pause;
  return filters.lifecycle === 'open' ? isOpen : !isOpen;
}

export default function OrganizationResponsibilityAssignmentModule({
  host,
}: {
  host: Host;
}) {
  const fixedTarget =
    host.kind === 'organization' ? host.targetOrganizationCode : undefined;
  const initialState =
    host.kind === 'global'
      ? host.state
      : {
          targetOrganizationCode: fixedTarget,
          lifecycle: 'open' as const,
          assignmentId: null,
        };
  const [filters, setFilters] =
    useState<OrganizationResponsibilityAssignmentState>(initialState);
  const [items, setItems] = useState<
    OrganizationResponsibilityAssignmentView[]
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] =
    useState<OrganizationResponsibilityAssignmentView | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [auditRevision, setAuditRevision] = useState(0);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const loadPage = useCallback(
    async (cursor?: string, options: { preserveOnError?: boolean } = {}) => {
      const requestId = ++listRequestIdRef.current;
      setLoading(true);
      try {
        const page = await searchOrganizationResponsibilityAssignments({
          ...(filters.targetOrganizationCode
            ? {
                targetOrganizationCode: filters.targetOrganizationCode,
              }
            : {}),
          ...(filters.employmentId
            ? { employmentId: filters.employmentId }
            : {}),
          ...(filters.typeCode ? { typeCode: filters.typeCode } : {}),
          lifecycle: filters.lifecycle,
          ...(cursor ? { cursor } : {}),
          limit: PAGE_SIZE,
        });
        if (requestId !== listRequestIdRef.current) return;
        setItems((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (requestId !== listRequestIdRef.current) return;
        if (!cursor && !options.preserveOnError) {
          setItems([]);
          setNextCursor(null);
        }
        message.error(
          error instanceof Error ? error.message : '加载责任任命失败',
        );
      } finally {
        if (requestId === listRequestIdRef.current) setLoading(false);
      }
    },
    [
      filters.employmentId,
      filters.lifecycle,
      filters.targetOrganizationCode,
      filters.typeCode,
    ],
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
        if (
          !options.allowOutOfScope &&
          !assignmentMatchesFilters(nextDetail, filters)
        ) {
          throw new Error('任命不属于当前链接筛选范围');
        }
        setDetail(nextDetail);
      } catch (error) {
        if (requestId !== detailRequestIdRef.current) return;
        const errorMessage =
          error instanceof Error ? error.message : '加载责任任命详情失败';
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
    void loadPage().then(() => {
      if (!cancelled && initialState.assignmentId) {
        void loadDetail(initialState.assignmentId);
      }
    });
    return () => {
      cancelled = true;
      listRequestIdRef.current += 1;
      detailRequestIdRef.current += 1;
    };
  }, [initialState.assignmentId, loadDetail, loadPage]);

  const applyFilters = (values: AssignmentSearchFormValues) => {
    const nextState: OrganizationResponsibilityAssignmentState = {
      ...(fixedTarget
        ? { targetOrganizationCode: fixedTarget }
        : values.targetOrganizationCode
          ? { targetOrganizationCode: values.targetOrganizationCode }
          : {}),
      ...(values.employmentId
        ? {
            employmentId: Number(
              typeof values.employmentId === 'number'
                ? values.employmentId
                : values.employmentId.value,
            ),
          }
        : {}),
      ...(values.typeCode ? { typeCode: values.typeCode } : {}),
      lifecycle: values.lifecycle ?? 'open',
      assignmentId: null,
    };
    setFilters(nextState);
    if (host.kind === 'global') host.onStateChange(nextState);
  };

  const resetFilters = () => {
    const nextState: OrganizationResponsibilityAssignmentState = {
      ...(fixedTarget ? { targetOrganizationCode: fixedTarget } : {}),
      lifecycle: 'open',
      assignmentId: null,
    };
    setFilters(nextState);
    if (host.kind === 'global') host.onStateChange(nextState);
  };

  const openDetail = (id: number) => {
    if (host.kind === 'global') {
      host.onStateChange({ ...filters, assignmentId: id });
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
    if (host.kind === 'global' && filters.assignmentId !== null) {
      host.onStateChange({ ...filters, assignmentId: null });
    }
  };

  const runLifecycleCommand = async (
    command: OrganizationResponsibilityAssignmentLifecycleCommandType,
  ) => {
    if (detail === null || lifecycleLoading) return;
    const assignmentId = detail.id;
    const handler = lifecycleCommandHandlers[command];
    setLifecycleLoading(true);
    try {
      await handler.mutate({ id: assignmentId });
      message.success(handler.successMessage);
      setAuditRevision((current) => current + 1);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '责任任命操作失败',
      );
    } finally {
      await Promise.all([
        loadPage(undefined, { preserveOnError: true }),
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
      <ProTable<
        OrganizationResponsibilityAssignmentView,
        AssignmentSearchFormValues
      >
        rowKey="id"
        loading={loading}
        columns={assignmentColumns(openDetail, fixedTarget)}
        dataSource={items}
        form={{
          initialValues: {
            targetOrganizationCode: initialState.targetOrganizationCode,
            employmentId: initialState.employmentId
              ? {
                  value: initialState.employmentId,
                  label: '已按指定任职筛选',
                }
              : undefined,
            typeCode: initialState.typeCode,
            lifecycle: initialState.lifecycle,
          },
        }}
        headerTitle="责任任命列表"
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1200 }}
        pagination={false}
        onSubmit={applyFilters}
        onReset={resetFilters}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            onClick={() => setCreateOpen(true)}
          >
            + 新建责任任命
          </Button>,
        ]}
        locale={{ emptyText: '无符合条件的责任任命' }}
      />
      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button loading={loading} onClick={() => void loadPage(nextCursor)}>
            加载更多
          </Button>
        </div>
      )}

      <OrganizationResponsibilityAssignmentFormModal
        open={createOpen}
        orgCode={fixedTarget}
        onOpenChange={setCreateOpen}
        onFailure={() => loadPage(undefined, { preserveOnError: true })}
        onSuccess={() => void loadPage()}
      />

      <Drawer
        title={detail ? `任命 #${detail.id}` : '责任任命详情'}
        open={detailOpen}
        loading={detailLoading}
        size="large"
        onClose={closeDetail}
      >
        {detailError && <Alert type="error" showIcon message={detailError} />}
        {detail && (
          <Tabs
            items={[
              {
                key: 'detail',
                label: '任命详情',
                children: (
                  <>
                    <OrganizationResponsibilityAssignmentLifecycleActions
                      loading={lifecycleLoading}
                      status={detail.status}
                      onCommand={runLifecycleCommand}
                    />
                    <Descriptions column={1} items={detailItems(detail)} />
                  </>
                ),
              },
              {
                key: 'audit',
                label: '操作日志',
                forceRender: true,
                children: (
                  <AuditLogTable
                    key={`${detail.id}:${auditRevision}`}
                    fixedConditions={{
                      targetType: 'organization_responsibility_assignment',
                      targetId: detail.id,
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
