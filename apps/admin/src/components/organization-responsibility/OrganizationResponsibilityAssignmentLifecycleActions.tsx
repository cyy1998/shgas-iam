import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  type AdminOrganizationResponsibilityAllowedActions,
  type OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType,
} from '@iam/contracts';
import { Button, Modal, Space } from 'antd';

export default function OrganizationResponsibilityAssignmentLifecycleActions({
  loading,
  allowedActions,
  onCommand,
}: {
  loading: boolean;
  allowedActions: AdminOrganizationResponsibilityAllowedActions;
  onCommand: (
    command: OrganizationResponsibilityAssignmentLifecycleCommandType,
  ) => Promise<void>;
}) {
  if (
    !allowedActions.pause.allowed &&
    !allowedActions.resume.allowed &&
    !allowedActions.end.allowed
  )
    return null;

  const confirmEnd = () => {
    Modal.confirm({
      title: '结束责任任命？',
      content: '结束后不可恢复；如需重新任命，必须创建新的责任任命。',
      okText: '确认结束',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        onCommand(
          ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End,
        ),
    });
  };

  return (
    <Space wrap style={{ marginBottom: 16 }}>
      {allowedActions.pause.allowed && (
        <Button
          loading={loading}
          onClick={() =>
            void onCommand(
              ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause,
            )
          }
        >
          暂停任命
        </Button>
      )}
      {allowedActions.resume.allowed && (
        <Button
          loading={loading}
          type="primary"
          onClick={() =>
            void onCommand(
              ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume,
            )
          }
        >
          恢复任命
        </Button>
      )}
      {allowedActions.end.allowed && (
        <Button danger disabled={loading} onClick={confirmEnd}>
          结束任命
        </Button>
      )}
    </Space>
  );
}
