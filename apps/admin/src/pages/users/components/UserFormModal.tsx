import {
  createUser,
  updateUser,
  type UserDetailVo,
} from '@admin/services/user';
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { getUserStatusOptions, getUserTypeOptions } from '@iam/contracts';
import { message, Modal } from 'antd';

type Mode = 'create' | 'edit';

type Props = {
  open: boolean;
  mode: Mode;
  initialValues?: UserDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function UserFormModal({
  open,
  mode,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = mode === 'edit';

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const showGeneratedPassword = (password: string) => {
    Modal.info({
      title: '用户创建成功 — 初始密码',
      content: (
        <div>
          <p>请将下列密码复制并告知用户，关闭后不再显示：</p>
          <pre style={{ fontSize: 16, background: '#f5f5f5', padding: 8 }}>
            {password}
          </pre>
        </div>
      ),
      okText: '我已复制',
    });
  };

  return (
    <ModalForm
      title={isEdit ? '编辑用户' : '新建用户'}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        initialValues
          ? {
              username: initialValues.username,
              name: initialValues.name,
              mobile: initialValues.mobile ?? '',
              wxId: initialValues.wxId ?? '',
              userType: initialValues.userType ?? '',
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
            await updateUser(initialValues!.username, {
              name: values.name,
              mobile: values.mobile || null,
              wxId: values.wxId || null,
              userType: values.userType || undefined,
              status: values.status,
            });
            message.success('更新成功');
          } else {
            const res = await createUser({
              username: values.username,
              name: values.name,
              userType: values.userType,
              password: values.password || undefined,
              mobile: values.mobile || null,
              wxId: values.wxId || null,
              status: values.status,
            });
            message.success('创建成功');
            if (res.generatedPassword) {
              showGeneratedPassword(res.generatedPassword);
            }
          }
          onSuccess?.();
          return true;
        } catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      <ProFormText
        name="username"
        label="用户名"
        disabled={isEdit}
        rules={[{ required: true, message: '请输入用户名' }]}
      />
      <ProFormText
        name="name"
        label="姓名"
        rules={[{ required: true, message: '请输入姓名' }]}
      />
      <ProFormSelect
        name="userType"
        label="用户类型"
        options={getUserTypeOptions()}
        rules={[{ required: true, message: '请选择用户类型' }]}
      />
      <ProFormText name="mobile" label="手机号" />
      <ProFormText name="wxId" label="微信 ID" />
      {!isEdit && (
        <ProFormText.Password
          name="password"
          label="初始密码"
          placeholder="留空则后端生成随机密码"
        />
      )}
      <ProFormSelect
        name="status"
        label="状态"
        options={getUserStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
