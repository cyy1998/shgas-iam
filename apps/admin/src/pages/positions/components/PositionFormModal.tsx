import {
  createPosition,
  type PositionVo,
  updatePosition,
} from '@/services/position';
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { getPositionStatusOptions } from '@iam/shared';
import { message } from 'antd';

type Props = {
  open: boolean;
  initialValues?: PositionVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function PositionFormModal({
  open,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;

  return (
    <ModalForm
      title={isEdit ? '编辑岗位' : '新建岗位'}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        initialValues
          ? {
              posCode: initialValues.posCode,
              posName: initialValues.posName,
              description: initialValues.description ?? '',
              status: initialValues.status,
            }
          : { status: 1 }
      }
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          if (isEdit) {
            await updatePosition(initialValues!.posCode, {
              posName: values.posName,
              description: values.description || null,
              status: values.status,
            });
            message.success('更新成功');
          } else {
            await createPosition({
              posCode: values.posCode,
              posName: values.posName,
              description: values.description || undefined,
              status: values.status,
            });
            message.success('创建成功');
          }
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : '操作失败');
          return false;
        }
      }}
    >
      <ProFormText
        name="posCode"
        label="岗位编码"
        disabled={isEdit}
        rules={[{ required: true, message: '请输入岗位编码' }]}
      />
      <ProFormText
        name="posName"
        label="岗位名称"
        rules={[{ required: true, message: '请输入岗位名称' }]}
      />
      <ProFormTextArea name="description" label="描述" />
      <ProFormSelect
        name="status"
        label="状态"
        options={getPositionStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
