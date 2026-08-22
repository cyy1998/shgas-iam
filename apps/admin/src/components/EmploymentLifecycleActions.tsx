import {
  endEmployment,
  type EmploymentVo,
  pauseEmployment,
  resumeEmployment,
} from '@admin/services/employment';
import { EmploymentStatus } from '@iam/contracts';
import { message, Modal, Space } from 'antd';

type EmploymentLifecycle = Pick<
  EmploymentVo,
  'id' | 'organization' | 'status'
>;

type Props = {
  employment: EmploymentLifecycle;
  onSuccess: () => Promise<void> | void;
};

export default function EmploymentLifecycleActions({
  employment,
  onSuccess,
}: Props) {
  const handleError = (error: unknown) =>
    message.error(error instanceof Error ? error.message : '操作失败');

  if (employment.status === EmploymentStatus.Disable) return null;

  const availabilityAction =
    employment.status === EmploymentStatus.Enable ? (
      <a
        onClick={() => {
          Modal.confirm({
            title: '确认暂停该任职？',
            content:
              '该任职下所有启用中的责任任命也会一并暂停；恢复任职后，责任任命仍需逐条恢复。',
            okText: '暂停任职',
            onOk: async () => {
              try {
                await pauseEmployment(employment.id);
                message.success('已暂停任职及其启用中的责任任命');
                await onSuccess();
              } catch (error) {
                handleError(error);
              }
            },
          });
        }}
      >
        暂停
      </a>
    ) : (
      <a
        onClick={async () => {
          const expectedAncestorOrgCode =
            employment.organization.companyNodes.at(-1)?.orgCode ??
            employment.organization.assignedOrg.orgCode;
          try {
            await resumeEmployment(
              employment.id,
              expectedAncestorOrgCode,
            );
            message.success(
              '已恢复任职；责任任命不会自动恢复，请在组织责任中逐条确认后恢复',
            );
            await onSuccess();
          } catch (error) {
            handleError(error);
          }
        }}
      >
        恢复
      </a>
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
          await endEmployment(employment.id);
          message.success('已结束');
          await onSuccess();
        } catch (error) {
          handleError(error);
        }
      },
    });
  };

  return (
    <Space size="small">
      {availabilityAction}
      <a style={{ color: '#d4380d' }} onClick={confirmEnd}>
        结束
      </a>
    </Space>
  );
}
