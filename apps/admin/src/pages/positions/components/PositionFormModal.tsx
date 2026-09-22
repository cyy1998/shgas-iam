import {
  createPosition,
  type PositionVo,
  updatePosition,
} from '@admin/services/position';
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { getPositionStatusOptions } from '@iam/contracts';
import { message } from 'antd';

type Props = {
  open: boolean;
  initialValues?: PositionVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const trimInput = (value: string | undefined) => value?.trim();

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
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      onFinish={async (values) => {
        try {
          if (isEdit) {
            const outcome = await updatePosition(initialValues!.posCode, {
              posName: values.posName.trim(),
              description: values.description || null,
              ...(values.status !== initialValues!.status
                ? { status: values.status }
                : {}),
            });
            message.success(outcome.changed ? '更新成功' : '无需修改');
          } else {
            const outcome = await createPosition({
              posCode: values.posCode.trim(),
              posName: values.posName.trim(),
              description: values.description || undefined,
              status: values.status,
            });
            message.success(outcome.changed ? '创建成功' : '无需修改');
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
        rules={[
          {
            transform: trimInput,
            required: true,
            whitespace: true,
            message: '请输入岗位编码',
          },
          {
            transform: trimInput,
            max: 64,
            message: '岗位编码最多64个字符',
          },
        ]}
      />
      <ProFormText
        name="posName"
        label="岗位名称"
        rules={[
          {
            transform: trimInput,
            required: true,
            whitespace: true,
            message: '请输入岗位名称',
          },
          {
            transform: trimInput,
            max: 128,
            message: '岗位名称最多128个字符',
          },
        ]}
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
