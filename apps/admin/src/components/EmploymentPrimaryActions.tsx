import {
  clearPrimaryEmployment,
  type EmploymentVo,
  setPrimaryEmployment,
} from '@admin/services/employment';
import { EmploymentStatus } from '@iam/contracts';
import { message, Modal } from 'antd';

type EmploymentPrimary = Pick<
  EmploymentVo,
  'id' | 'isPrimary' | 'position' | 'status' | 'user'
>;

type Props = {
  employment: EmploymentPrimary;
  onSuccess: () => Promise<void> | void;
};

export default function EmploymentPrimaryActions({
  employment,
  onSuccess,
}: Props) {
  const handleError = (error: unknown) =>
    message.error(error instanceof Error ? error.message : '操作失败');

  if (employment.status === EmploymentStatus.Disable) return null;

  const nextPrimary = !employment.isPrimary;
  const submit = async () => {
    try {
      if (nextPrimary) {
        await setPrimaryEmployment(employment.id);
        message.success('已设为主岗');
      } else {
        await clearPrimaryEmployment(employment.id);
        message.success('已取消主岗');
      }
      await onSuccess();
    } catch (error) {
      handleError(error);
    }
  };

  const confirm = () => {
    Modal.confirm({
      title: nextPrimary
        ? `将 ${employment.user.name} 的主岗设为 ${employment.position.posName}？`
        : `取消 ${employment.user.name} 的主任职？`,
      content: nextPrimary
        ? '该用户的其它 Open Employment 将不再是主任职。'
        : '取消后该用户可以暂时没有主任职，系统不会自动补位。',
      okText: nextPrimary ? '设为主岗' : '取消主岗',
      onOk: submit,
    });
  };

  return <a onClick={confirm}>{nextPrimary ? '设主岗' : '取消主岗'}</a>;
}
