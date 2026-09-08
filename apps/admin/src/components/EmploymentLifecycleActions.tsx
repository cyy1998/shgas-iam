import AuthorizationActionButton from '@admin/components/AuthorizationActionButton';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  endEmployment,
  pauseEmployment,
  resumeEmployment,
  type EmploymentVo,
} from '@admin/services/employment';
import type { AdminEmploymentAllowedActions } from '@iam/contracts';
import { EmploymentStatus } from '@iam/contracts';
import type { ButtonProps } from 'antd';
import { message, Modal, Space } from 'antd';

type EmploymentLifecycle = Pick<EmploymentVo, 'id' | 'organization' | 'status'>;

type Props = {
  buttonStyle?: ButtonProps['style'];
  buttonType?: ButtonProps['type'];
  decisions: Pick<AdminEmploymentAllowedActions, 'end' | 'pause' | 'resume'>;
  employment: EmploymentLifecycle;
  onSuccess: () => Promise<void> | void;
  onCommitted: (error: AdminMutationCommittedError) => Promise<void>;
};

export default function EmploymentLifecycleActions({
  buttonStyle,
  buttonType,
  decisions,
  employment,
  onSuccess,
  onCommitted,
}: Props) {
  const handleError = async (error: unknown) => {
    if (error instanceof AdminMutationCommittedError) {
      await onCommitted(error);
      return;
    }
    message.error(error instanceof Error ? error.message : '操作失败');
  };

  if (employment.status === EmploymentStatus.Disable) return null;

  const availabilityAction =
    employment.status === EmploymentStatus.Enable ? (
      <AuthorizationActionButton
        decision={decisions.pause}
        onClick={() => {
          Modal.confirm({
            title: '确认暂停该任职？',
            content:
              '该任职下所有启用中的责任任命也会一并暂停；恢复任职后，责任任命仍需逐条恢复。',
            okText: '暂停任职',
            onOk: async () => {
              try {
                const outcome = await pauseEmployment(employment.id);
                if (outcome.changed)
                  message.success('已暂停任职及其启用中的责任任命');
                else message.info('无需修改');
                await onSuccess();
              } catch (error) {
                await handleError(error);
              }
            },
          });
        }}
        style={buttonStyle}
        type={buttonType}
      >
        暂停
      </AuthorizationActionButton>
    ) : (
      <AuthorizationActionButton
        decision={decisions.resume}
        onClick={async () => {
          const expectedAncestorOrgCode =
            employment.organization.companyNodes.at(-1)?.orgCode ??
            employment.organization.assignedOrg.orgCode;
          try {
            const outcome = await resumeEmployment(
              employment.id,
              expectedAncestorOrgCode,
            );
            if (outcome.changed)
              message.success(
                '已恢复任职；责任任命不会自动恢复，请在组织责任中逐条确认后恢复',
              );
            else message.info('无需修改');
            await onSuccess();
          } catch (error) {
            await handleError(error);
          }
        }}
        style={buttonStyle}
        type={buttonType}
      >
        恢复
      </AuthorizationActionButton>
    );

  const confirmEnd = () => {
    Modal.confirm({
      title: '确认结束该任职？',
      content:
        '结束后不可恢复；该任职下所有开放责任任命会一并结束，后续新任职不会继承这些责任。',
      okText: '结束任职',
      okType: 'danger',
      onOk: async () => {
        try {
          const outcome = await endEmployment(employment.id);
          if (outcome.changed) message.success('已结束');
          else message.info('无需修改');
          await onSuccess();
        } catch (error) {
          await handleError(error);
        }
      },
    });
  };

  return (
    <Space size="small">
      {availabilityAction}
      <AuthorizationActionButton
        danger
        decision={decisions.end}
        onClick={confirmEnd}
        style={buttonStyle}
        type={buttonType}
      >
        结束
      </AuthorizationActionButton>
    </Space>
  );
}
