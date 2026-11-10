import { requestClientOptions } from "@admin/pages/roles/role-selectors";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { createRole } from "@admin/services/role";
import { ModalForm, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { GLOBAL_ROLE_PREFIX, getRoleStatusOptions, RoleStatus, RoleType, roleTypeOptions } from "@iam/contracts";
import { Form, message } from "antd";
import { useEffect } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (roleCode: string) => void;
  onCommitted: (error: AdminMutationCommittedError, roleCode: string) => void;
};

type RoleFormValues = {
  roleType: RoleType;
  clientCode: string;
  roleCode: string;
  roleName: string;
  status: RoleStatus;
  description?: string;
};

function roleCodeSuffix(value: string, prefix: string) {
  const code = value.trim();
  return prefix && code.startsWith(prefix) ? code.slice(prefix.length).trim() : code;
}

export default function RoleFormModal({ open, onOpenChange, onSuccess, onCommitted }: Props) {
  const [form] = Form.useForm<RoleFormValues>();
  const clientCode = Form.useWatch("clientCode", form);
  const roleType = Form.useWatch("roleType", form);
  const isGlobal = roleType === RoleType.Global;
  const prefix = isGlobal ? GLOBAL_ROLE_PREFIX : clientCode ? `${clientCode}:` : "";

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  return (
    <ModalForm<RoleFormValues>
      form={form}
      name="role-form"
      title="新建角色"
      open={open}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: "确定",
      }}
      initialValues={{ roleType: RoleType.Client, status: RoleStatus.Enable }}
      onOpenChange={onOpenChange}
      onFinish={async (values) => {
        const ownership =
          values.roleType === RoleType.Global
            ? { roleType: values.roleType }
            : { roleType: values.roleType, clientCode: values.clientCode };
        const codePrefix = values.roleType === RoleType.Global ? GLOBAL_ROLE_PREFIX : `${values.clientCode}:`;
        const roleCode = codePrefix + roleCodeSuffix(values.roleCode, codePrefix);
        try {
          const outcome = await createRole({
            ...ownership,
            roleCode,
            roleName: values.roleName,
            description: values.description ?? null,
            status: values.status,
          });
          message.success(outcome.changed ? "角色已创建" : "无需修改");
          onSuccess(outcome.result.roleCode);
          return true;
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            onCommitted(err, roleCode);
            return true;
          }
          message.error(err instanceof Error ? err.message : "保存失败");
          return false;
        }
      }}
    >
      <ProFormSelect
        name="roleType"
        label="角色类型"
        options={roleTypeOptions}
        rules={[{ required: true, message: "请选择角色类型" }]}
        fieldProps={{ allowClear: false }}
      />
      {!isGlobal && (
        <ProFormSelect
          name="clientCode"
          label="所属应用"
          showSearch
          rules={[{ required: true, message: "请选择所属应用" }]}
          fieldProps={{
            filterOption: false,
            placeholder: "输入应用名称或编码搜索",
            showSearch: true,
          }}
          request={(params) => requestClientOptions(params)}
        />
      )}
      <ProFormText
        name="roleCode"
        label="角色编码"
        dependencies={["roleType", "clientCode"]}
        normalize={(value: string) =>
          prefix && value.trim().startsWith(prefix) ? roleCodeSuffix(value, prefix) : value
        }
        rules={[
          { required: true, message: "请输入角色编码" },
          {
            validator: (_, value: string | undefined) => {
              const suffix = roleCodeSuffix(value ?? "", prefix);
              if (!suffix) return Promise.reject(new Error("请输入角色编码"));
              if (prefix.length + suffix.length > 64)
                return Promise.reject(
                  new Error(isGlobal ? "角色编码含全局前缀不能超过 64 个字符" : "角色编码含应用前缀不能超过 64 个字符"),
                );
              return Promise.resolve();
            },
          },
        ]}
        fieldProps={{
          addonBefore: prefix || undefined,
          placeholder: "请输入角色编码后缀",
          maxLength: 64,
        }}
        extra={
          isGlobal
            ? "自动添加 global: 前缀，只需填写角色编码后缀。"
            : "自动添加所属应用编码前缀，只需填写角色编码后缀。"
        }
      />
      <ProFormText name="roleName" label="角色名称" rules={[{ required: true }]} fieldProps={{ maxLength: 128 }} />
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
