import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
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
import { useEffect, useRef } from 'react';

type Mode = 'create' | 'edit';

type Props = {
  open: boolean;
  mode: Mode;
  initialValues?: UserDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (username?: string) => void;
  onCommitted: (
    error: AdminMutationCommittedError,
    username: string,
    generatedPasswordMissing: boolean,
  ) => void;
};

const trimInput = (value: string | undefined) => value?.trim() ?? '';

export default function UserFormModal({
  open,
  mode,
  initialValues,
  onOpenChange,
  onSuccess,
  onCommitted,
}: Props) {
  const isEdit = mode === 'edit';
  const editedFieldsRef = useRef(new Set<string>());
  useEffect(() => {
    editedFieldsRef.current.clear();
  }, [open, initialValues]);

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
      onValuesChange={(changed) => {
        Object.keys(changed).forEach((field) =>
          editedFieldsRef.current.add(field),
        );
      }}
      initialValues={
        initialValues
          ? {
              username: initialValues.username,
              name: initialValues.name,
              mobile: initialValues.mobile ?? '',
              wxId: initialValues.wxId ?? '',
              userType: initialValues.userType ?? '',
            }
          : { status: 1 }
      }
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      onFinish={async (values) => {
        const normalizedUsername = trimInput(values.username);
        const normalizedName = trimInput(values.name);
        try {
          if (isEdit) {
            const data: Parameters<typeof updateUser>[1] = {};
            if (editedFieldsRef.current.has('name')) data.name = normalizedName;
            if (editedFieldsRef.current.has('mobile'))
              data.mobile = values.mobile || null;
            if (editedFieldsRef.current.has('wxId'))
              data.wxId = values.wxId || null;
            if (editedFieldsRef.current.has('userType'))
              data.userType = values.userType;
            if (Object.keys(data).length === 0) {
              message.info('请先编辑需要保存的字段');
              return false;
            }
            const outcome = await updateUser(initialValues!.username, data);
            message.success(outcome.changed ? '更新成功' : '无需修改');
            onSuccess?.();
          } else {
            const res = await createUser({
              username: normalizedUsername,
              name: normalizedName,
              userType: values.userType,
              password: values.password || undefined,
              mobile: values.mobile || null,
              wxId: values.wxId || null,
              status: values.status,
            });
            message.success('创建成功');
            if (res.result.generatedPassword) {
              showGeneratedPassword(res.result.generatedPassword);
            }
            onSuccess?.(res.result.user.username);
          }
          return true;
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            onCommitted(
              err,
              initialValues?.username ?? normalizedUsername,
              !isEdit && !values.password,
            );
            return true;
          }
          handleError(err);
          return false;
        }
      }}
    >
      <ProFormText
        name="username"
        label="用户名"
        disabled={isEdit}
        rules={[
          {
            transform: trimInput,
            required: true,
            whitespace: true,
            message: '请输入用户名',
          },
          {
            transform: trimInput,
            max: 64,
            message: '用户名最多64个字符',
          },
        ]}
      />
      <ProFormText
        name="name"
        label="姓名"
        rules={[
          {
            transform: trimInput,
            required: true,
            whitespace: true,
            message: '请输入姓名',
          },
          {
            transform: trimInput,
            max: 64,
            message: '姓名最多64个字符',
          },
        ]}
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
      {!isEdit && (
        <ProFormSelect
          name="status"
          label="状态"
          options={getUserStatusOptions().map((o) => ({
            label: o.label,
            value: o.value,
          }))}
          rules={[{ required: true }]}
        />
      )}
    </ModalForm>
  );
}
