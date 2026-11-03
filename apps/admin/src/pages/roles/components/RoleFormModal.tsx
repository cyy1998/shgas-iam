import { requestClientOptions } from "@admin/pages/roles/role-selectors";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { createRole } from "@admin/services/role";
import { ModalForm, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { getRoleStatusOptions, RoleStatus } from "@iam/contracts";
import { message } from "antd";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (roleCode: string) => void;
  onCommitted: (error: AdminMutationCommittedError, roleCode: string) => void;
};

export default function RoleFormModal({ open, onOpenChange, onSuccess, onCommitted }: Props) {
  return (
    <ModalForm
      name="role-form"
      title="新建角色"
      open={open}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: "确定",
      }}
      initialValues={{ status: RoleStatus.Enable }}
      onOpenChange={onOpenChange}
      onFinish={async (values) => {
        try {
          const outcome = await createRole({
            roleCode: values.roleCode,
            roleName: values.roleName,
            clientCode: values.clientCode,
            description: values.description ?? null,
            status: values.status,
          });
          message.success(outcome.changed ? "角色已创建" : "无需修改");
          onSuccess(outcome.result.roleCode);
          return true;
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            onCommitted(err, values.roleCode);
            return true;
          }
          message.error(err instanceof Error ? err.message : "保存失败");
          return false;
        }
      }}
    >
      <ProFormText name="roleCode" label="角色编码" rules={[{ required: true }]} fieldProps={{ maxLength: 64 }} />
      <ProFormText name="roleName" label="角色名称" rules={[{ required: true }]} fieldProps={{ maxLength: 128 }} />
      <ProFormSelect
        name="clientCode"
        label="所属应用"
        showSearch
        rules={[{ required: true }]}
        fieldProps={{
          filterOption: false,
          placeholder: "输入应用名称或编码搜索",
          showSearch: true,
        }}
        request={(params) => requestClientOptions(params)}
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
      <ProFormTextArea name="description" label="描述" fieldProps={{ maxLength: 500, showCount: true }} />
    </ModalForm>
  );
}
