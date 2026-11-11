import { useAccess } from "@admin/admin-access";
import StatusTag from "@admin/components/StatusTag";
import UserDetailDrawer from "@admin/pages/users/components/UserDetailDrawer";
import UserFormModal from "@admin/pages/users/components/UserFormModal";
import { searchUsers, type UserVo } from "@admin/services/user";
import { FilterOutlined, PlusOutlined } from "@ant-design/icons";
import { type ActionType, PageContainer, type ProColumns, ProTable } from "@ant-design/pro-components";
import { getUserStatusOptions, getUserTypeOptions, type UserStatus, type UserType } from "@iam/contracts";
import { Alert, Button, Empty, Grid, Input, Select } from "antd";
import { useRef, useState } from "react";
import styles from "./UsersPage.module.less";

type UserFilters = { user?: string; status?: UserStatus; userType?: UserType };

export default function UsersPage() {
  const access = useAccess();
  const screens = Grid.useBreakpoint();
  const actionRef = useRef<ActionType>(undefined);
  const [committedWarning, setCommittedWarning] = useState<string>();
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [drawerUsername, setDrawerUsername] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>({});
  const [searchText, setSearchText] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const hasFilters = Boolean(filters.user || filters.status !== undefined || filters.userType);

  const columns: ProColumns<UserVo>[] = [
    {
      title: "用户",
      dataIndex: "name",
      width: screens.sm ? 260 : undefined,
      search: false,
      render: (_, row) => (
        <div className={styles.identity}>
          <span className={styles.name} title={row.name || row.username}>
            {row.name || row.username}
          </span>
          <span className={styles.secondary} title={row.username}>
            {row.username}
          </span>
          <span className={styles["mobile-summary"]}>
            {row.userType} · {row.mobile || "未填写手机号"}
          </span>
        </div>
      ),
    },
    { title: "手机号", dataIndex: "mobile", width: 160, search: false, responsive: ["sm"] },
    {
      title: "类型",
      dataIndex: "userType",
      width: 100,
      responsive: ["md"],
      valueType: "select",
      valueEnum: Object.fromEntries(getUserTypeOptions().map((o) => [o.value, { text: o.label }])),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      valueType: "select",
      valueEnum: Object.fromEntries(getUserStatusOptions().map((o) => [o.value, { text: o.label }])),
      render: (_, row) => <StatusTag domain="user" status={row.status} />,
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      width: 170,
      responsive: ["lg"],
      search: false,
      render: (_, row) => new Date(row.createTime).toLocaleString(),
    },
    {
      title: "操作",
      fixed: "right",
      valueType: "option",
      width: 64,
      render: (_, row) => (
        <Button
          key="view"
          type="link"
          size="small"
          style={{ paddingInline: 0 }}
          onClick={() => setDrawerUsername(row.username)}
        >
          查看
        </Button>
      ),
    },
  ];

  const filterControls = (
    <div className={styles.filters}>
      <Input.Search
        className={styles.search}
        aria-label="搜索用户"
        placeholder="搜索姓名或工号"
        allowClear
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onSearch={(user) => setFilters((current) => ({ ...current, user: user.trim() || undefined }))}
      />
      <Button
        className={styles["filter-toggle"]}
        icon={<FilterOutlined aria-hidden />}
        aria-expanded={filtersExpanded}
        aria-controls="user-filters"
        onClick={() => setFiltersExpanded((value) => !value)}
      >
        筛选{filters.status !== undefined || filters.userType ? " · 已选" : ""}
      </Button>
      <div id="user-filters" className={`${styles["filter-fields"]} ${filtersExpanded ? styles.expanded : ""}`}>
        <Select<UserType>
          aria-label="用户类型"
          placeholder="全部类型"
          allowClear
          value={filters.userType}
          options={getUserTypeOptions()}
          onChange={(userType) => setFilters((current) => ({ ...current, userType }))}
        />
        <Select<UserStatus>
          aria-label="用户状态"
          placeholder="全部状态"
          allowClear
          value={filters.status}
          options={getUserStatusOptions()}
          onChange={(status) => setFilters((current) => ({ ...current, status }))}
        />
      </div>
      {hasFilters && (
        <Button
          type="text"
          onClick={() => {
            setSearchText("");
            setFilters({});
          }}
        >
          清除筛选
        </Button>
      )}
    </div>
  );

  return (
    <PageContainer title={false} breadcrumbRender={false} className={styles.page}>
      {committedWarning && <Alert type="warning" showIcon message={committedWarning} />}
      <section className={styles.surface} aria-label="用户列表">
        {loadError && (
          <Alert
            type="error"
            showIcon
            title="用户列表加载失败"
            description={loadError}
            action={<Button onClick={() => actionRef.current?.reload()}>重试</Button>}
          />
        )}
        <ProTable<UserVo>
          defaultSize="small"
          actionRef={actionRef}
          rowKey="username"
          columns={columns}
          search={false}
          options={screens.sm ? undefined : { density: false, setting: false }}
          params={filters}
          headerTitle={filterControls}
          toolBarRender={() =>
            access.canCreateUser
              ? [
                  <Button
                    key="create"
                    type="primary"
                    icon={<PlusOutlined aria-hidden />}
                    onClick={() => setCreateFormOpen(true)}
                  >
                    新建用户
                  </Button>,
                ]
              : []
          }
          columnsState={{ defaultValue: { createTime: { show: false } } }}
          pagination={{ defaultPageSize: 20, hideOnSinglePage: true, showSizeChanger: true }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={loadError ? "暂时无法显示用户" : hasFilters ? "没有符合筛选条件的用户" : "暂无用户"}
              />
            ),
          }}
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
              const text = (user ?? "").trim();
              const statusNum =
                status === undefined || status === null || status === "" ? undefined : (Number(status) as UserStatus);
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
              setLoadError(undefined);
              return {
                data: data.result,
                total: data.total,
                success: true,
              };
            } catch (err) {
              setLoadError(err instanceof Error ? err.message : "请稍后重试");
              return { data: [], total: 0, success: false };
            }
          }}
        />
      </section>

      <UserFormModal
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onCommitted={(error, username, generatedPasswordMissing) => {
          setCommittedWarning(
            generatedPasswordMissing
              ? `用户创建已生效，但初始密码未能交付。${error.message}；请先修复，再主动重置密码。`
              : error.message,
          );
          setCreateFormOpen(false);
          setDrawerUsername(username);
          actionRef.current?.reload();
        }}
        onSuccess={(username) => {
          if (username) setDrawerUsername(username);
          setCreateFormOpen(false);
          actionRef.current?.reload();
        }}
      />

      <UserDetailDrawer
        open={drawerUsername !== null}
        username={drawerUsername}
        onClose={() => setDrawerUsername(null)}
        onChanged={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
}
