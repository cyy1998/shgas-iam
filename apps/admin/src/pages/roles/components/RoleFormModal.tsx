import { requestClientOptions } from '@admin/pages/roles/role-selectors';
import {
  type RoleDetailVo,
  createRole,
  updateRole,
} from '@admin/services/role';
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { getRoleStatusOptions, RoleStatus } from '@iam/contracts';
import { message } from 'antd';

type Props = {
  open: boolean;
  initialValues: RoleDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function RoleFormModal({
  open,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const editing = initialValues !== null;

  return (
    <ModalForm
      title={editing ? '编辑角色' : '新建角色'}
      open={open}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      initialValues={
        initialValues
          ? {
              ...initialValues,
              clientCode: initialValues.client.clientCode,
            }
          : { status: RoleStatus.Enable }
      }
      onOpenChange={onOpenChange}
      onFinish={async (values) => {
        try {
          if (editing && initialValues) {
            await updateRole(initialValues.roleCode, {
              roleName: values.roleName,
              description: values.description ?? null,
              status: values.status,
            });
            message.success('角色已更新');
          } else {
            await createRole({
              roleCode: values.roleCode,
              roleName: values.roleName,
              clientCode: values.clientCode,
              description: values.description ?? null,
              status: values.status,
            });
            message.success('角色已创建');
          }
          onSuccess();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : '保存失败');
          return false;
        }
      }}
    >
      <ProFormText
        name="roleCode"
        label="角色编码"
        disabled={editing}
        rules={[{ required: true }]}
        fieldProps={{ maxLength: 64 }}
      />
      <ProFormText
        name="roleName"
        label="角色名称"
        rules={[{ required: true }]}
        fieldProps={{ maxLength: 128 }}
      />
      <ProFormSelect
        name="clientCode"
        label="所属应用"
        disabled={editing}
        showSearch
        rules={[{ required: true }]}
        fieldProps={{
          filterOption: false,
          placeholder: editing ? undefined : '输入应用名称或编码搜索',
          showSearch: true,
        }}
        request={(params) =>
          requestClientOptions(params, initialValues?.client)
        }
      />
      <ProFormSelect
        name="status"
        label="状态"
        options={getRoleStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
      <ProFormTextArea
        name="description"
        label="描述"
        fieldProps={{ maxLength: 500, showCount: true }}
      />
    </ModalForm>
  );
}
