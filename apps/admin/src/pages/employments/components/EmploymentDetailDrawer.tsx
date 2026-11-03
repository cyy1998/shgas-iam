import AuthorizationActionButton from "@admin/components/AuthorizationActionButton";
import AuditLogTable from "@admin/components/audit/AuditLogTable";
import styles from "@admin/components/detail/DetailDrawer.module.less";
import DetailHeaderActions from "@admin/components/detail/DetailHeaderActions";
import EmploymentLifecycleActions from "@admin/components/EmploymentLifecycleActions";
import EmploymentPrimaryActions from "@admin/components/EmploymentPrimaryActions";
import EmploymentResponsibilitySummary from "@admin/components/organization-responsibility/EmploymentResponsibilitySummary";
import StatusTag from "@admin/components/StatusTag";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { type EmploymentDetailVo, getEmployment, updateEmployment } from "@admin/services/employment";
import { StopOutlined, SwapOutlined } from "@ant-design/icons";
import { useAccess } from "@umijs/max";
import { Alert, Descriptions, Drawer, Empty, message, Skeleton, Space, Tabs, Tag, Typography, theme } from "antd";
import { useEffect, useState } from "react";
import EmploymentDescriptionForm from "./EmploymentDescriptionForm";
import TransferModal from "./TransferModal";

type Props = {
  open: boolean;
  employmentId: number | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
};

function formatOrgPath(detail: EmploymentDetailVo) {
  return (
    detail.organization?.fullOrgPath?.map((node) => node.orgName).join(" / ") || detail.organization.assignedOrg.orgName
  );
}

function formatCompany(detail: EmploymentDetailVo) {
  const companyNodes = detail.organization.companyNodes;
  const company = companyNodes[companyNodes.length - 1];
  return company ? `${company.orgName} (${company.orgCode})` : "—";
}

function formatUser(detail: EmploymentDetailVo) {
  return `${detail.user.name} (${detail.user.username})`;
}

function formatPosition(detail: EmploymentDetailVo) {
  return `${detail.position.posName} (${detail.position.posCode})`;
}

export default function EmploymentDetailDrawer({ open, employmentId, onClose, onChanged }: Props) {
  return (
    <EmploymentDetailDrawerContent
      key={open ? employmentId : "closed"}
      open={open}
      employmentId={employmentId}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function EmploymentDetailDrawerContent({ open, employmentId, onClose, onChanged }: Props) {
  const access = useAccess();
  const { token } = theme.useToken();
  const [committedWarning, setCommittedWarning] = useState<string>();
  const [detail, setDetail] = useState<EmploymentDetailVo | null>(null);
  const [loading, setLoading] = useState(open && employmentId !== null);
  const [editOpen, setEditOpen] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [transferOpen, setTransferOpen] = useState(false);

  const loadDetail = async () => {
    if (employmentId === null) return;
    const nextDetail = await getEmployment(employmentId);
    setDetail(nextDetail);
    if (!nextDetail.allowedActions.editDescription.allowed) setEditOpen(false);
  };

  useEffect(() => {
    if (!open || employmentId === null) return;

    let cancelled = false;
    getEmployment(employmentId)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : "加载详情失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, employmentId]);

  const refresh = async () => {
    await loadDetail();
    await onChanged?.();
  };

  const onCommitted = async (error: AdminMutationCommittedError) => {
    setCommittedWarning(error.message);
    setEditOpen(false);
    setTransferOpen(false);
    try {
      await refresh();
    } catch (refreshError) {
      message.error(refreshError instanceof Error ? refreshError.message : "刷新失败");
    }
  };

  const saveDescription = async (description: string) => {
    if (!detail?.allowedActions.editDescription.allowed || savingDescription) return;
    setSavingDescription(true);
    try {
      try {
        const outcome = await updateEmployment(detail.id, { description: description || null });
        if (outcome.changed) message.success("备注已更新");
        else message.info("无需修改");
      } catch (error) {
        if (!(error instanceof AdminMutationCommittedError)) {
          message.error(error instanceof Error ? error.message : "操作失败");
          return;
        }
        setCommittedWarning(error.message);
        setTransferOpen(false);
      }
      setEditOpen(false);
      try {
        await loadDetail();
      } catch (error) {
        message.error(`备注已保存，但详情刷新失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
      try {
        await onChanged?.();
      } catch (error) {
        message.error(`备注已保存，但列表刷新失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
    } finally {
      setSavingDescription(false);
    }
  };

  return (
    <Drawer
      size={840}
      open={open}
      onClose={() => {
        if (!savingDescription) onClose();
      }}
      closable={!savingDescription}
      keyboard={!savingDescription}
      mask={{ closable: !savingDescription }}
      destroyOnHidden
      classNames={{ header: styles["drawer-header"], extra: styles["drawer-actions"] }}
      styles={{
        header: { padding: "14px 20px" },
        body: { padding: "16px 20px", background: token.colorBgLayout },
      }}
      title={
        detail ? (
          <Space size={6} wrap>
            <span>{detail.user.name}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {detail.user.username}
            </Typography.Text>
            {detail.isPrimary ? <Tag color="blue">主岗</Tag> : null}
            <StatusTag domain="employment" status={detail.status} />
          </Space>
        ) : (
          "雇佣详情"
        )
      }
      extra={
        detail &&
        !editOpen &&
        !savingDescription && (
          <DetailHeaderActions>
            <Space size={8}>
              <AuthorizationActionButton
                decision={detail.allowedActions.transfer}
                onClick={() => setTransferOpen(true)}
                icon={<SwapOutlined aria-hidden />}
              >
                转岗
              </AuthorizationActionButton>
              <EmploymentPrimaryActions
                onCommitted={onCommitted}
                decision={detail.isPrimary ? detail.allowedActions.clearPrimary : detail.allowedActions.setPrimary}
                employment={detail}
                onSuccess={refresh}
              />
            </Space>
            <div className={styles["header-danger-actions"]} style={{ borderColor: token.colorBorderSecondary }}>
              <EmploymentLifecycleActions
                onCommitted={onCommitted}
                decisions={detail.allowedActions}
                employment={detail}
                onSuccess={refresh}
                endButtonProps={{
                  color: "danger",
                  variant: "filled",
                  icon: <StopOutlined aria-hidden />,
                  style: detail.allowedActions.end.allowed
                    ? {
                        borderColor: token.colorErrorBorder,
                        color: token.colorErrorTextActive,
                        fontWeight: 500,
                      }
                    : undefined,
                }}
              />
            </div>
          </DetailHeaderActions>
        )
      }
    >
      {committedWarning && <Alert type="warning" showIcon title={committedWarning} />}
      {loading && !detail ? <Skeleton active /> : null}
      {!loading && !detail ? <Empty /> : null}
      {detail && (
        <>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              if (!savingDescription) setActiveTab(key);
            }}
            items={[
              {
                key: "details",
                label: "任职信息",
                children: (
                  <div className={styles.content}>
                    <section
                      aria-label="基本信息"
                      className={`${styles.section} ${styles["basic-section"]}`}
                      style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                    >
                      <div className={styles["section-header"]}>
                        <Typography.Title level={5} className={styles["section-title"]}>
                          基本信息
                        </Typography.Title>
                        {!editOpen && !savingDescription && (
                          <AuthorizationActionButton
                            decision={detail.allowedActions.editDescription}
                            onClick={() => setEditOpen(true)}
                            type="link"
                            size="small"
                          >
                            编辑备注
                          </AuthorizationActionButton>
                        )}
                      </div>
                      <Descriptions
                        className={styles.descriptions}
                        size="middle"
                        column={{ xs: 1, sm: 2 }}
                        styles={{
                          label: { fontSize: 13 },
                          content: { fontSize: 14, lineHeight: "24px", overflowWrap: "anywhere" },
                        }}
                        items={[
                          { key: "user", label: "用户", style: { width: "50%" }, children: formatUser(detail) },
                          { key: "company", label: "公司", style: { width: "50%" }, children: formatCompany(detail) },
                          { key: "organization", label: "组织路径", span: "filled", children: formatOrgPath(detail) },
                          { key: "position", label: "岗位", children: formatPosition(detail) },
                          { key: "primary", label: "主岗", children: detail.isPrimary ? "是" : "否" },
                          { key: "start", label: "开始", children: new Date(detail.startTime).toLocaleString() },
                          {
                            key: "end",
                            label: "结束",
                            children: detail.endTime ? new Date(detail.endTime).toLocaleString() : "—",
                          },
                          ...(!editOpen
                            ? [
                                {
                                  key: "description",
                                  label: "备注",
                                  span: "filled" as const,
                                  children: <span className={styles.description}>{detail.description || "—"}</span>,
                                },
                              ]
                            : []),
                        ]}
                      />
                      {editOpen && detail.allowedActions.editDescription.allowed && (
                        <EmploymentDescriptionForm
                          description={detail.description}
                          saving={savingDescription}
                          onSave={saveDescription}
                          onCancel={() => setEditOpen(false)}
                        />
                      )}
                      <div className={styles["role-row"]}>
                        <Typography.Text type="secondary" className={styles["field-label"]}>
                          角色（{detail.roles.length}）
                        </Typography.Text>
                        <div className={styles["role-list"]}>
                          {detail.roles.length === 0 ? (
                            <Typography.Text type="secondary">—</Typography.Text>
                          ) : (
                            detail.roles.map((role) => (
                              <Tag key={role} className={styles["role-tag"]}>
                                {detail.roleNames[role] || "未命名角色"}
                              </Tag>
                            ))
                          )}
                        </div>
                      </div>
                      <Space
                        className={styles.metadata}
                        size={[20, 4]}
                        wrap
                        style={{ borderColor: token.colorBorderSecondary }}
                      >
                        <Typography.Text type="secondary">
                          创建于 {new Date(detail.createTime).toLocaleString()}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          更新于 {new Date(detail.updateTime).toLocaleString()}
                        </Typography.Text>
                      </Space>
                    </section>
                    {access.canAccessOrganizationResponsibility && (
                      <section
                        aria-label="组织责任"
                        className={styles.section}
                        inert={savingDescription}
                        style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                      >
                        <div className={styles["section-header"]}>
                          <Typography.Title level={5} className={styles["section-title"]}>
                            组织责任
                          </Typography.Title>
                        </div>
                        <EmploymentResponsibilitySummary employmentId={detail.id} />
                      </section>
                    )}
                  </div>
                ),
              },
              ...(access.canAccessAudit
                ? [
                    {
                      key: "logs",
                      label: "操作日志",
                      disabled: savingDescription,
                      children: (
                        <section
                          aria-label="操作日志"
                          className={styles.section}
                          style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                        >
                          <AuditLogTable
                            fixedConditions={{ targetType: "employment", targetId: detail.id }}
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
          <TransferModal
            onCommitted={onCommitted}
            open={transferOpen}
            employment={detail}
            onOpenChange={setTransferOpen}
            onSuccess={async () => {
              setTransferOpen(false);
              await refresh();
            }}
          />
        </>
      )}
    </Drawer>
  );
}
