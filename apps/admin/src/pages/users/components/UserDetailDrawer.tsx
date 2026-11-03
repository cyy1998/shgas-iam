import AuthorizationActionButton from "@admin/components/AuthorizationActionButton";
import AuthorizationActionDropdown from "@admin/components/AuthorizationActionDropdown";
import AuditLogTable from "@admin/components/audit/AuditLogTable";
import styles from "@admin/components/detail/DetailDrawer.module.less";
import DetailHeaderActions from "@admin/components/detail/DetailHeaderActions";
import EmploymentLifecycleActions from "@admin/components/EmploymentLifecycleActions";
import EmploymentPrimaryActions from "@admin/components/EmploymentPrimaryActions";
import EmploymentResponsibilitySummary from "@admin/components/organization-responsibility/EmploymentResponsibilitySummary";
import StatusTag from "@admin/components/StatusTag";
import EmploymentFormModal from "@admin/pages/employments/components/EmploymentFormModal";
import TransferModal from "@admin/pages/employments/components/TransferModal";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { resignUser } from "@admin/services/employment";
import { deleteUser, getUser, type UserDetailVo, updateUser, updateUserStatus } from "@admin/services/user";
import { DeleteOutlined, DownOutlined, KeyOutlined, LogoutOutlined } from "@ant-design/icons";
import { EmploymentStatus, getUserStatusOptions, UserStatus } from "@iam/contracts";
import { Link, useAccess } from "@umijs/max";
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Drawer,
  Empty,
  Modal,
  message,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { confirmResetPassword } from "./ResetPasswordModal";
import UserBasicInformation from "./UserBasicInformation";

type EmploymentRow = UserDetailVo["employments"][number];

const employmentTableActionStyle: CSSProperties = {
  fontWeight: "inherit",
  fontSize: 13,
  paddingInline: 0,
  height: 24,
};

const formatDate = (value: Date | string | null | undefined) => (value ? new Date(value).toLocaleDateString() : "—");

const formatEmploymentOrgPath = (row: EmploymentRow) =>
  row.organization?.fullOrgPath?.map((node) => node.orgName).join(" / ") || row.organization.assignedOrg.orgName || "—";

const formatEmploymentPosition = (row: EmploymentRow) => `${row.position.posName} (${row.position.posCode})`;

type Props = {
  open: boolean;
  username: string | null;
  onClose: () => void;
  onChanged: () => void;
};

export default function UserDetailDrawer({ open, username, onClose, onChanged }: Props) {
  return (
    <UserDetailDrawerContent
      key={open ? username : "closed"}
      open={open}
      username={username}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function UserDetailDrawerContent({ open, username, onClose, onChanged }: Props) {
  const access = useAccess();
  const { token } = theme.useToken();
  const headerDangerButtonStyle: CSSProperties = {
    borderColor: token.colorErrorBorder,
    color: token.colorErrorTextActive,
    fontWeight: 500,
  };
  const [committedWarning, setCommittedWarning] = useState<string>();
  const [detail, setDetail] = useState<UserDetailVo | null>(null);
  const [loading, setLoading] = useState(open && username !== null);
  const [employmentFormOpen, setEmploymentFormOpen] = useState(false);
  const [transferEmployment, setTransferEmployment] = useState<EmploymentRow | null>(null);
  const [showEndedEmployments, setShowEndedEmployments] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const employments = detail?.employments ?? [];
  const visibleEmployments = employments.filter(
    (row) => showEndedEmployments || row.status !== EmploymentStatus.Disable,
  );

  useEffect(() => {
    if (!open || !username) return;

    let cancelled = false;
    getUser(username)
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
  }, [open, username]);

  const handleError = (err: unknown) => message.error(err instanceof Error ? err.message : "操作失败");

  const refresh = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const d = await getUser(username);
      setDetail(d);
      if (!d.allowedActions.editProfile.allowed) setEditingProfile(false);
    } finally {
      setLoading(false);
    }
    onChanged();
  };

  const saveProfile = async (data: Parameters<typeof updateUser>[1]) => {
    if (!detail?.allowedActions.editProfile.allowed || savingProfile) return false;
    setSavingProfile(true);
    try {
      try {
        const outcome = await updateUser(detail.username, data);
        if (outcome.changed) message.success("更新成功");
        else message.info("无需修改");
      } catch (error) {
        if (!(error instanceof AdminMutationCommittedError)) {
          handleError(error);
          return false;
        }
        setCommittedWarning(error.message);
      }
      setEditingProfile(false);
      try {
        await refresh();
      } catch (error) {
        onChanged();
        message.error(`基本信息已保存，但详情刷新失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
      return true;
    } finally {
      setSavingProfile(false);
    }
  };

  const onEmploymentCommitted = async (error: AdminMutationCommittedError) => {
    setCommittedWarning(error.message);
    setEmploymentFormOpen(false);
    setTransferEmployment(null);
    try {
      await refresh();
    } catch (refreshError) {
      handleError(refreshError);
    }
  };

  const onStatusChange = async (status: UserStatus) => {
    if (!detail) return;
    try {
      const outcome = await updateUserStatus(detail.username, status);
      if (outcome.changed) message.success("状态已更新");
      else message.info("状态无需修改");
      await refresh();
    } catch (err) {
      if (err instanceof AdminMutationCommittedError) {
        setCommittedWarning(err.message);
        try {
          await refresh();
        } catch (refreshError) {
          handleError(refreshError);
        }
        return;
      }
      handleError(err);
    }
  };

  const onDelete = () => {
    if (!detail) return;
    Modal.confirm({
      title: `删除用户 ${detail.name}？`,
      content:
        "软删除后用户将不再可见。存在开放任职或未结束的应用委托时无法删除，请先处理任职或在委托管理中结束相关委托。",
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await deleteUser(detail.username);
          if (outcome.changed) message.success("已删除");
          else message.info("无需删除");
          onChanged();
          onClose();
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            setCommittedWarning(`删除已生效。${err.message}`);
            setDetail(null);
            onChanged();
            try {
              await refresh();
            } catch (refreshError) {
              handleError(refreshError);
            }
            return;
          }
          handleError(err);
        }
      },
    });
  };

  const onResign = () => {
    if (!detail) return;
    Modal.confirm({
      title: `办理用户 ${detail.name} 离职？`,
      content: "该操作将结束全部开放任职并停用用户，提交后会尝试撤销现有会话。",
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await resignUser(detail.username);
          if (outcome.changed) message.success("离职已完成");
          else message.info("已处于离职状态，无需修改");
          await refresh();
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            await onEmploymentCommitted(err);
            return;
          }
          handleError(err);
        }
      },
    });
  };

  const employmentColumns: ColumnsType<EmploymentRow> = [
    {
      title: "任职信息",
      key: "employment",
      render: (_: unknown, row) => (
        <Space orientation="vertical" size={4} style={{ width: "100%", minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>
            {formatEmploymentOrgPath(row)}
          </Typography.Text>
          <Space size={6} wrap>
            {access.canAccessEmployment && row.managementPath ? (
              <Link to={row.managementPath} style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                {formatEmploymentPosition(row)}
              </Link>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                {formatEmploymentPosition(row)}
              </Typography.Text>
            )}
            <StatusTag domain="employment" status={row.status} />
            {row.isPrimary ? (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                主岗
              </Tag>
            ) : null}
          </Space>
        </Space>
      ),
    },
    {
      title: "任职期间",
      key: "period",
      width: 120,
      render: (_: unknown, row) => (
        <div style={{ fontSize: 12, lineHeight: "24px" }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              开始{" "}
            </Typography.Text>
            {formatDate(row.startTime)}
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              结束{" "}
            </Typography.Text>
            {formatDate(row.endTime)}
          </div>
        </div>
      ),
    },
  ];

  if (access.canAccessOrganizationResponsibility) {
    employmentColumns.push({
      title: "组织责任",
      key: "responsibilities",
      width: 210,
      render: (_: unknown, row: EmploymentRow) => <EmploymentResponsibilitySummary employmentId={row.id} compact />,
    });
  }

  if (access.canAccessEmployment) {
    employmentColumns.push({
      title: "操作",
      key: "action",
      width: 150,
      render: (_: unknown, row: EmploymentRow) => {
        const hasAllowedAction = Object.values(row.allowedActions).some((decision) => decision.allowed);
        if (!row.managementPath && !hasAllowedAction) return null;
        return (
          <ConfigProvider componentSize="small">
            <Space size={[12, 0]} wrap>
              <AuthorizationActionButton
                decision={row.allowedActions.transfer}
                onClick={() => setTransferEmployment(row)}
                style={employmentTableActionStyle}
                type="link"
              >
                转岗
              </AuthorizationActionButton>
              <EmploymentPrimaryActions
                onCommitted={onEmploymentCommitted}
                decision={row.isPrimary ? row.allowedActions.clearPrimary : row.allowedActions.setPrimary}
                buttonStyle={employmentTableActionStyle}
                buttonType="link"
                employment={row}
                onSuccess={refresh}
              />
              <EmploymentLifecycleActions
                onCommitted={onEmploymentCommitted}
                buttonStyle={employmentTableActionStyle}
                buttonType="link"
                decisions={row.allowedActions}
                employment={row}
                onSuccess={refresh}
              />
            </Space>
          </ConfigProvider>
        );
      },
    });
  }

  return (
    <>
      {access.canAccessEmployment && (
        <>
          <EmploymentFormModal
            onCommitted={onEmploymentCommitted}
            open={employmentFormOpen}
            presetUsername={detail?.username}
            presetName={detail?.name}
            presetUserStatus={detail?.status}
            onOpenChange={setEmploymentFormOpen}
            onSuccess={async () => {
              setEmploymentFormOpen(false);
              await refresh();
            }}
          />
          <TransferModal
            onCommitted={onEmploymentCommitted}
            open={transferEmployment !== null}
            employment={transferEmployment}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setTransferEmployment(null);
            }}
            onSuccess={async () => {
              setTransferEmployment(null);
              await refresh();
            }}
          />
        </>
      )}
      <Drawer
        size={840}
        open={open}
        onClose={() => {
          if (!savingProfile) onClose();
        }}
        closable={!savingProfile}
        keyboard={!savingProfile}
        mask={{ closable: !savingProfile }}
        destroyOnHidden
        classNames={{ header: styles["drawer-header"], extra: styles["drawer-actions"] }}
        styles={{
          header: { padding: "14px 20px" },
          body: { padding: "16px 20px", background: token.colorBgLayout },
        }}
        title={
          detail ? (
            <Space size={6} wrap>
              <span>{detail.name}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {detail.username}
              </Typography.Text>
              <StatusTag domain="user" status={detail.status} />
            </Space>
          ) : (
            "用户详情"
          )
        }
        extra={
          detail &&
          !editingProfile &&
          !savingProfile && (
            <DetailHeaderActions>
              <Space size={8}>
                <AuthorizationActionDropdown
                  decision={detail.allowedActions.changeStatus}
                  menu={{
                    items: getUserStatusOptions()
                      .filter((o) => o.value !== detail.status)
                      .map((o) => ({
                        key: String(o.value),
                        label: `切为「${o.label}」`,
                        onClick: () => onStatusChange(o.value as UserStatus),
                      })),
                  }}
                >
                  <Space size={6}>
                    状态
                    <DownOutlined aria-hidden style={{ fontSize: 10 }} />
                  </Space>
                </AuthorizationActionDropdown>
                <AuthorizationActionButton
                  decision={detail.allowedActions.resetPassword}
                  icon={<KeyOutlined aria-hidden />}
                  onClick={() =>
                    confirmResetPassword({
                      username: detail.username,
                      name: detail.name,
                      onSuccess: refresh,
                      onCommitted: async (error) => {
                        setCommittedWarning(
                          `密码重置已生效，但新密码未能交付。${error.message}；请先修复，再主动重置密码。`,
                        );
                        try {
                          await refresh();
                        } catch (refreshError) {
                          handleError(refreshError);
                        }
                      },
                    })
                  }
                >
                  重置密码
                </AuthorizationActionButton>
              </Space>
              <div className={styles["header-danger-actions"]} style={{ borderColor: token.colorBorderSecondary }}>
                <AuthorizationActionButton
                  variant="filled"
                  color="danger"
                  decision={detail.allowedActions.delete}
                  onClick={onDelete}
                  icon={<DeleteOutlined aria-hidden />}
                  style={detail.allowedActions.delete.allowed ? headerDangerButtonStyle : undefined}
                >
                  删除
                </AuthorizationActionButton>
                <AuthorizationActionButton
                  variant="filled"
                  color="danger"
                  decision={detail.allowedActions.resign}
                  onClick={onResign}
                  icon={<LogoutOutlined aria-hidden />}
                  style={detail.allowedActions.resign.allowed ? headerDangerButtonStyle : undefined}
                >
                  离职
                </AuthorizationActionButton>
              </div>
            </DetailHeaderActions>
          )
        }
      >
        {committedWarning && <Alert type="warning" showIcon message={committedWarning} />}
        {loading && !detail ? <Skeleton active /> : null}
        {!loading && !detail ? <Empty /> : null}
        {detail && (
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              if (!savingProfile) setActiveTab(key);
            }}
            items={[
              {
                key: "details",
                label: "用户信息",
                children: (
                  <div className={styles.content}>
                    <UserBasicInformation
                      detail={detail}
                      editing={editingProfile}
                      saving={savingProfile}
                      onEdit={() => setEditingProfile(true)}
                      onCancel={() => setEditingProfile(false)}
                      onSave={saveProfile}
                    />
                    <section
                      aria-label="雇佣信息"
                      className={styles.section}
                      inert={savingProfile}
                      style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                    >
                      <div className={styles["section-header"]}>
                        <Space size={8}>
                          <Typography.Title level={5} className={styles["section-title"]}>
                            雇佣信息
                          </Typography.Title>
                          <Tag style={{ marginInlineEnd: 0 }}>{employments.length}</Tag>
                        </Space>
                        <Space size={[12, 8]} wrap>
                          <Checkbox
                            checked={showEndedEmployments}
                            onChange={(event) => setShowEndedEmployments(event.target.checked)}
                            style={{ fontSize: 12 }}
                          >
                            显示已结束任职
                          </Checkbox>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {visibleEmployments.length} / {employments.length} 条
                          </Typography.Text>
                          {access.canCreateEmployment && (
                            <Button
                              size="small"
                              type="primary"
                              disabled={detail.status === UserStatus.Disable}
                              title={
                                detail.status === UserStatus.Disable
                                  ? "用户已停用，请由有权限的管理员恢复账号后再新增任职"
                                  : undefined
                              }
                              onClick={() => setEmploymentFormOpen(true)}
                            >
                              + 新增雇佣
                            </Button>
                          )}
                        </Space>
                      </div>
                      <ConfigProvider
                        theme={{
                          token: { fontSize: 13 },
                          components: { Table: { headerBg: token.colorFillAlter, cellPaddingBlockSM: 10 } },
                        }}
                      >
                        <Table<EmploymentRow>
                          rowKey="id"
                          size="small"
                          tableLayout="fixed"
                          columns={employmentColumns}
                          dataSource={visibleEmployments}
                          pagination={false}
                          scroll={{
                            x:
                              360 +
                              (access.canAccessOrganizationResponsibility ? 210 : 0) +
                              (access.canAccessEmployment ? 150 : 0),
                          }}
                          locale={{
                            emptyText: showEndedEmployments || employments.length === 0 ? "暂无雇佣" : "暂无未结束任职",
                          }}
                        />
                      </ConfigProvider>
                    </section>
                  </div>
                ),
              },
              ...(access.canAccessAudit
                ? [
                    {
                      key: "logs",
                      label: "操作日志",
                      disabled: savingProfile,
                      children: (
                        <section
                          aria-label="操作日志"
                          className={styles.section}
                          style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
                        >
                          <AuditLogTable
                            fixedConditions={{ targetType: "user", targetCode: detail.username }}
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
