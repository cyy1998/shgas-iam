import AuditLogTable from "@admin/components/audit/AuditLogTable";
import styles from "@admin/components/detail/DetailDrawer.module.less";
import DetailHeaderActions from "@admin/components/detail/DetailHeaderActions";
import StatusTag from "@admin/components/StatusTag";
import { roleAssignmentTargetTypeOptions } from "@admin/pages/roles/role-selectors";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  deleteRoleAssignment,
  getRole,
  type RoleAssignmentVo,
  type RoleDetailVo,
  type RoleUpdateInput,
  searchRoleAssignments,
  updateRole,
  updateRoleAssignmentScope,
} from "@admin/services/role";
import { PlusOutlined } from "@ant-design/icons";
import { type ActionType, type ProColumns, ProTable } from "@ant-design/pro-components";
import { RoleAssignmentTargetType } from "@iam/contracts";
import {
  Alert,
  Button,
  ConfigProvider,
  Drawer,
  Empty,
  Modal,
  message,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import RoleAssignmentFormModal from "./RoleAssignmentFormModal";
import RoleBasicInformation from "./RoleBasicInformation";
import roleStyles from "./RoleDetailDrawer.module.less";

type Props = {
  open: boolean;
  roleCode: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void> | void;
  initialEditing?: boolean;
  committedWarning?: string;
  reloadSeq?: number;
  onCommitted: (error: AdminMutationCommittedError) => void;
};

export default function RoleDetailDrawer(props: Props) {
  return <RoleDetailDrawerContent key={props.open ? props.roleCode : "closed"} {...props} />;
}

function RoleDetailDrawerContent({
  open,
  roleCode,
  onOpenChange,
  onChanged,
  initialEditing = false,
  committedWarning,
  reloadSeq,
  onCommitted,
}: Props) {
  const { token } = theme.useToken();
  const assignmentActionRef = useRef<ActionType>(undefined);
  const [detail, setDetail] = useState<RoleDetailVo | null>(null);
  const [loading, setLoading] = useState(open && roleCode !== null);
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const handleError = useCallback((err: unknown) => message.error(err instanceof Error ? err.message : "操作失败"), []);

  const load = useCallback(async () => {
    if (!open || !roleCode) return;
    setLoading(true);
    try {
      setDetail(await getRole(roleCode));
    } finally {
      setLoading(false);
    }
  }, [open, roleCode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadSeq is an explicit parent-driven reload trigger.
  useEffect(() => {
    void load().catch((error: unknown) => {
      handleError(error);
      setDetail(null);
    });
  }, [load, reloadSeq, handleError]);

  const reloadAssignments = () => {
    assignmentActionRef.current?.reload();
    void load().catch((error: unknown) => {
      handleError(error);
      setDetail(null);
    });
    void onChanged();
  };

  const saveProfile = async (data: RoleUpdateInput) => {
    if (!detail || saving) return false;
    setSaving(true);
    try {
      try {
        const outcome = await updateRole(detail.roleCode, data);
        if (outcome.changed) message.success("角色已更新");
        else message.info("无需修改");
      } catch (error) {
        if (!(error instanceof AdminMutationCommittedError)) {
          handleError(error);
          return false;
        }
        onCommitted(error);
      }
      setEditing(false);
      try {
        await load();
      } catch (error) {
        message.error(`基本信息已保存，但详情刷新失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
      try {
        await onChanged();
      } catch (error) {
        message.error(`基本信息已保存，但列表刷新失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleMutationError = (error: unknown) => {
    if (error instanceof AdminMutationCommittedError) {
      onCommitted(error);
      setAssignmentFormOpen(false);
      reloadAssignments();
    } else {
      handleError(error);
    }
  };

  const onDeleteAssignment = (row: RoleAssignmentVo) => {
    if (!detail) return;
    Modal.confirm({
      title: `删除 ${row.targetTypeText} 分配？`,
      content: `${row.target.name} 将不再通过该角色获得授权。`,
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await deleteRoleAssignment(detail.roleCode, row.id);
          message.success(outcome.changed ? "分配已删除" : "无需修改");
          reloadAssignments();
        } catch (err) {
          handleMutationError(err);
        }
      },
    });
  };

  const onToggleScope = async (row: RoleAssignmentVo) => {
    if (!detail) return;
    try {
      const outcome = await updateRoleAssignmentScope(detail.roleCode, row.id, !row.includeDescendants);
      message.success(outcome.changed ? "作用范围已更新" : "无需修改");
      reloadAssignments();
    } catch (err) {
      handleMutationError(err);
    }
  };

  const assignmentColumns: ProColumns<RoleAssignmentVo>[] = [
    {
      title: "类型",
      dataIndex: "targetType",
      width: 72,
      valueType: "select",
      valueEnum: Object.fromEntries(roleAssignmentTargetTypeOptions.map((o) => [o.value, { text: o.label }])),
      fieldProps: { placeholder: "全部类型", allowClear: true },
      render: (_, row) => <Tag>{row.targetTypeText}</Tag>,
    },
    {
      title: "对象",
      dataIndex: "targetText",
      fieldProps: { placeholder: "搜索对象名称或编码", allowClear: true },
      render: (_, row) => (
        <div style={{ overflowWrap: "anywhere" }}>
          <Typography.Text style={{ fontSize: 13 }}>{row.target.name}</Typography.Text>
          {row.targetType !== RoleAssignmentTargetType.Employment && row.target.status !== null && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.target.code}
              </Typography.Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "作用范围",
      dataIndex: "includeDescendants",
      width: 112,
      valueType: "select",
      valueEnum: {
        true: { text: "含下级组织" },
        false: { text: "仅当前对象" },
      },
      fieldProps: { placeholder: "全部范围", allowClear: true },
      render: (_, row) => row.scopeText,
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      width: 100,
      search: false,
      render: (_, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }} title={new Date(row.createTime).toLocaleString()}>
          {new Date(row.createTime).toLocaleDateString()}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      valueType: "option",
      width: 140,
      render: (_, row) => (
        <Space size={[12, 0]} wrap>
          {row.targetType === RoleAssignmentTargetType.Organization ? (
            <Button
              key="scope"
              type="link"
              size="small"
              style={{ paddingInline: 0, fontSize: 13, fontWeight: 400 }}
              onClick={() => onToggleScope(row)}
            >
              {row.includeDescendants ? "仅本组织" : "含下级"}
            </Button>
          ) : null}
          <Button
            key="delete"
            type="link"
            size="small"
            danger
            style={{ paddingInline: 0, fontSize: 13, fontWeight: 400 }}
            onClick={() => onDeleteAssignment(row)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Drawer
        size={840}
        open={open}
        onClose={() => {
          if (!saving) onOpenChange(false);
        }}
        closable={!saving}
        keyboard={!saving}
        mask={{ closable: !saving }}
        destroyOnHidden
        classNames={{ header: styles["drawer-header"], extra: styles["drawer-actions"] }}
        styles={{ header: { padding: "14px 20px" }, body: { padding: "16px 20px", background: token.colorBgLayout } }}
        title={
          detail ? (
            <Space size={6} wrap>
              <span>{detail.roleName}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {detail.roleCode}
              </Typography.Text>
              <StatusTag domain="role" status={detail.status} />
            </Space>
          ) : (
            "角色详情"
          )
        }
      >
        {committedWarning && <Alert type="warning" showIcon title={committedWarning} />}
        {loading && !detail ? <Skeleton active /> : null}
        {!loading && !detail ? <Empty /> : null}
        {detail ? (
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              if (!saving) setActiveTab(key);
            }}
            items={[
              {
                key: "details",
                label: "角色信息",
                children: (
                  <div className={styles.content}>
                    <RoleBasicInformation
                      detail={detail}
                      editing={editing}
                      saving={saving}
                      onEdit={() => setEditing(true)}
                      onCancel={() => setEditing(false)}
                      onSave={saveProfile}
                    />
                    <section
                      aria-label="分配对象"
                      className={styles.section}
                      inert={saving}
                      style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                    >
                      <div className={styles["section-header"]}>
                        <Space size={8}>
                          <Typography.Title level={5} className={styles["section-title"]}>
                            分配对象
                          </Typography.Title>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            共 {detail.assignmentCount} 个
                          </Typography.Text>
                        </Space>
                        <DetailHeaderActions>
                          <Button
                            type="primary"
                            icon={<PlusOutlined aria-hidden />}
                            onClick={() => setAssignmentFormOpen(true)}
                          >
                            新增分配
                          </Button>
                        </DetailHeaderActions>
                      </div>
                      <ProTable<RoleAssignmentVo>
                        actionRef={assignmentActionRef}
                        rowKey="id"
                        size="small"
                        columns={assignmentColumns}
                        cardProps={false}
                        search={{
                          labelWidth: "auto",
                          layout: "vertical",
                          defaultCollapsed: false,
                          collapseRender: false,
                          span: 6,
                          searchGutter: 0,
                          style: { padding: 0 },
                        }}
                        searchFormRender={(_, form) => (
                          <ConfigProvider
                            theme={{
                              components: { Form: { labelFontSize: 12, labelColor: token.colorTextSecondary } },
                            }}
                          >
                            <div
                              className={roleStyles.filters}
                              style={{ background: token.colorFillAlter, borderColor: token.colorBorderSecondary }}
                            >
                              {form}
                            </div>
                          </ConfigProvider>
                        )}
                        form={{ size: "middle" }}
                        scroll={{ x: 620 }}
                        options={false}
                        toolBarRender={false}
                        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
                        request={async (params) => {
                          try {
                            const {
                              current = 1,
                              pageSize = 10,
                              targetText,
                              targetType,
                              includeDescendants,
                            } = params as {
                              current?: number;
                              pageSize?: number;
                              targetText?: string;
                              targetType?: RoleAssignmentTargetType;
                              includeDescendants?: string | boolean;
                            };
                            const includeValue =
                              includeDescendants === undefined
                                ? undefined
                                : includeDescendants === true || includeDescendants === "true";
                            const data = await searchRoleAssignments(detail.roleCode, {
                              pageNum: current,
                              pageSize,
                              conditions: {
                                fuzzyConditions: targetText ? { text: targetText } : {},
                                exactConditions: {
                                  targetType,
                                  includeDescendants: includeValue,
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
                      />
                    </section>
                  </div>
                ),
              },
              {
                key: "logs",
                label: "操作日志",
                disabled: saving,
                children: (
                  <section
                    aria-label="操作日志"
                    className={styles.section}
                    style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                  >
                    <AuditLogTable
                      fixedConditions={{ targetType: "role", targetCode: detail.roleCode }}
                      pageSize={10}
                      search={false}
                      size="small"
                    />
                  </section>
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
      <RoleAssignmentFormModal
        open={assignmentFormOpen}
        roleCode={detail?.roleCode ?? null}
        onOpenChange={setAssignmentFormOpen}
        onSuccess={reloadAssignments}
        onError={handleError}
        onCommitted={handleMutationError}
      />
    </>
  );
}
