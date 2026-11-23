import { useAccess } from "@admin/admin-access";
import AuthorizationActionButton from "@admin/components/AuthorizationActionButton";
import AuthorizationActionDropdown from "@admin/components/AuthorizationActionDropdown";
import CustomAttributeDetails from "@admin/components/custom-attributes/CustomAttributeDetails";
import StatusTag from "@admin/components/StatusTag";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  deleteOrganization,
  type OrganizationChildrenPage,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
  updateOrganizationStatus,
} from "@admin/services/organization";
import { getOrganizationStatusOptions, OrganizationStatus } from "@iam/contracts";
import { Button, Empty, Modal, message, Space, Spin, Table, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import styles from "../OrganizationsPage.module.less";
import OrganizationResponsibilityAssignmentsPanel from "./OrganizationResponsibilityAssignmentsPanel";

type Props = {
  loading: boolean;
  detail: OrganizationDetailVo | null;
  pathLabel?: string;
  childrenPage: OrganizationChildrenPage | null;
  childrenLoading: boolean;
  onChildrenPageChange: (pageNum: number, pageSize: number) => void;
  onEdit: () => void;
  onCreateChild: () => void;
  onSelectChild: (orgCode: string) => void;
  onChanged: () => void;
  onDeleted?: () => void;
  onCommitted?: (error: AdminMutationCommittedError) => void;
};

const childColumns = (onSelectChild: (orgCode: string) => void): ColumnsType<OrganizationTreeNode> => [
  {
    title: "编码",
    dataIndex: "orgCode",
    render: (v, row) => (
      <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => onSelectChild(row.orgCode)}>
        {v}
      </Button>
    ),
  },
  { title: "名称", dataIndex: "orgName" },
  { title: "类型", dataIndex: "orgType" },
  {
    title: "状态",
    dataIndex: "status",
    render: (_, row) => <StatusTag domain="org" status={row.status} />,
  },
];

export default function OrgDetailPanel({
  loading,
  detail,
  pathLabel,
  childrenPage,
  childrenLoading,
  onChildrenPageChange,
  onEdit,
  onCreateChild,
  onSelectChild,
  onChanged,
  onDeleted,
  onCommitted,
}: Props) {
  const access = useAccess();
  if (!detail) {
    return (
      <div style={{ padding: "40px 16px" }}>
        <Empty description="请选择左侧组织查看详情" />
      </div>
    );
  }

  const overviewFields = [
    { label: "编码", value: detail.orgCode },
    { label: "名称", value: detail.orgName },
    { label: "类型", value: detail.orgType },
    { label: "层级", value: detail.level },
    { label: "上级", value: detail.parentCode ? `${detail.parentName} (${detail.parentCode})` : "—" },
    { label: "状态", value: <StatusTag domain="org" status={detail.status} /> },
    { label: "下级数", value: detail.childrenCount },
    { label: "在职雇佣", value: detail.employmentCount },
    { label: "创建时间", value: new Date(detail.createTime).toLocaleString() },
    { label: "更新时间", value: new Date(detail.updateTime).toLocaleString() },
  ];

  const handleError = (err: unknown) => {
    if (err instanceof AdminMutationCommittedError) {
      onCommitted?.(err);
      return;
    }
    message.error(err instanceof Error ? err.message : "操作失败");
  };

  const onStatusChange = async (status: number) => {
    const mutate = async () => {
      try {
        const outcome = await updateOrganizationStatus(detail.orgCode, status);
        message.success(outcome.changed ? "状态已更新" : "无需修改");
        onChanged();
      } catch (err) {
        handleError(err);
      }
    };
    if (status === OrganizationStatus.Enable) {
      await mutate();
      return;
    }
    Modal.confirm({
      title: "确认变更组织状态？",
      content: "服务端将检查该组织及全部下级组织；任一组织仍是开放责任任命目标时，本次变更会被阻止。",
      okText: "确认变更",
      onOk: mutate,
    });
  };

  const onDelete = () => {
    Modal.confirm({
      title: `删除组织 ${detail.orgName}？`,
      content: "服务端将检查该组织及全部下级组织；存在开放责任任命时会拒绝删除。软删除后不会出现在列表中。",
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await deleteOrganization(detail.orgCode);
          message.success(outcome.changed ? "已删除" : "无需修改");
          (onDeleted ?? onChanged)();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  return (
    <div className={styles["detail-panel"]}>
      <div className={styles["detail-header"]}>
        <Space size={8} className={styles.identity}>
          <h3>
            {detail.orgName}
            <span className={styles.secondary}>{detail.orgCode}</span>
          </h3>
          <StatusTag domain="org" status={detail.status} />
        </Space>
        <Space className={styles.actions}>
          <AuthorizationActionButton decision={detail.allowedActions.createChild} onClick={onCreateChild}>
            + 下级组织
          </AuthorizationActionButton>
          <AuthorizationActionButton type="primary" decision={detail.allowedActions.edit} onClick={onEdit}>
            编辑
          </AuthorizationActionButton>
          <AuthorizationActionDropdown
            decision={detail.allowedActions.changeStatus}
            menu={{
              items: getOrganizationStatusOptions()
                .filter((o) => o.value !== detail.status)
                .map((o) => ({
                  key: String(o.value),
                  label: `切为「${o.label}」`,
                  onClick: () => onStatusChange(o.value),
                })),
            }}
          >
            状态
          </AuthorizationActionDropdown>
          <AuthorizationActionButton danger decision={detail.allowedActions.delete} onClick={onDelete}>
            删除
          </AuthorizationActionButton>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: "organization-detail",
            label: "组织详情",
            children: (
              <>
                <Spin spinning={loading}>
                  <dl className={styles.overview}>
                    {overviewFields.map(({ label, value }) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div className={styles["overview-path"]}>
                      <dt>路径</dt>
                      <dd>{pathLabel || "—"}</dd>
                    </div>
                  </dl>
                </Spin>

                <CustomAttributeDetails
                  definitions={detail.customAttributeDefinitions ?? []}
                  values={detail.customAttributes ?? {}}
                />

                <div className={styles["children-section"]}>
                  <h4 className={styles["section-title"]}>
                    下级组织
                    {childrenPage && childrenPage.total > 0 && (
                      <span className={styles.secondary}>共 {childrenPage.total} 条</span>
                    )}
                  </h4>
                  <Table<OrganizationTreeNode>
                    rowKey="orgCode"
                    size="small"
                    scroll={{ x: 480 }}
                    loading={childrenLoading}
                    columns={childColumns(onSelectChild)}
                    dataSource={childrenPage?.result ?? []}
                    pagination={{
                      current: childrenPage?.pageNum ?? 1,
                      pageSize: childrenPage?.pageSize ?? 20,
                      total: childrenPage?.total ?? 0,
                      showSizeChanger: true,
                      pageSizeOptions: [10, 20, 50, 100],
                      onChange: (page, size) => onChildrenPageChange(page, size),
                    }}
                    locale={{ emptyText: "无下级组织" }}
                  />
                </div>
              </>
            ),
          },
          ...(access.canAccessOrganizationResponsibility
            ? [
                {
                  key: "responsibility-assignments",
                  label: "责任任命",
                  children: <OrganizationResponsibilityAssignmentsPanel orgCode={detail.orgCode} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
