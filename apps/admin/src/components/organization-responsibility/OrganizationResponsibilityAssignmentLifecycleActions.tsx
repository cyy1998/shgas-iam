import styles from "@admin/components/detail/DetailDrawer.module.less";
import { StopOutlined } from "@ant-design/icons";
import {
  type AdminOrganizationResponsibilityAllowedActions,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  type OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType,
} from "@iam/contracts";
import { Button, Modal, theme } from "antd";

export default function OrganizationResponsibilityAssignmentLifecycleActions({
  loading,
  allowedActions,
  onCommand,
}: {
  loading: boolean;
  allowedActions: AdminOrganizationResponsibilityAllowedActions;
  onCommand: (command: OrganizationResponsibilityAssignmentLifecycleCommandType) => Promise<void>;
}) {
  const { token } = theme.useToken();
  if (!allowedActions.pause.allowed && !allowedActions.resume.allowed && !allowedActions.end.allowed) return null;

  const confirmEnd = () => {
    Modal.confirm({
      title: "结束责任任命？",
      content: "结束后不可恢复；如需重新任命，必须创建新的责任任命。",
      okText: "确认结束",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => onCommand(ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End),
    });
  };

  return (
    <>
      {allowedActions.pause.allowed && (
        <Button
          loading={loading}
          onClick={() => void onCommand(ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause)}
        >
          暂停任命
        </Button>
      )}
      {allowedActions.resume.allowed && (
        <Button
          loading={loading}
          type="primary"
          onClick={() => void onCommand(ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume)}
        >
          恢复任命
        </Button>
      )}
      {allowedActions.end.allowed && (
        <div className={styles["header-danger-actions"]} style={{ borderColor: token.colorBorderSecondary }}>
          <Button
            color="danger"
            variant="filled"
            icon={<StopOutlined aria-hidden />}
            style={
              !loading
                ? { borderColor: token.colorErrorBorder, color: token.colorErrorTextActive, fontWeight: 500 }
                : undefined
            }
            disabled={loading}
            onClick={confirmEnd}
          >
            结束任命
          </Button>
        </div>
      )}
    </>
  );
}
