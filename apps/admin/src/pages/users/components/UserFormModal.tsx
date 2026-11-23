import CustomAttributeFields from "@admin/components/custom-attributes/CustomAttributeFields";
import { useCustomAttributeDefinitions } from "@admin/components/custom-attributes/useCustomAttributeDefinitions";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { createUser } from "@admin/services/user";
import { ModalForm, ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { getUserStatusOptions } from "@iam/contracts";
import { Alert, Button, Form, message } from "antd";
import { showGeneratedPassword } from "./GeneratedPasswordModal";
import UserProfileFields from "./UserProfileFields";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (username?: string) => void;
  onCommitted: (error: AdminMutationCommittedError, username: string, generatedPasswordMissing: boolean) => void;
};

const trimInput = (value: string | undefined) => value?.trim() ?? "";

export default function UserFormModal({ open, onOpenChange, onSuccess, onCommitted }: Props) {
  const [form] = Form.useForm<Parameters<typeof createUser>[0]>();
  const { state: attributes, reload } = useCustomAttributeDefinitions("user", open);
  const handleError = (err: unknown) => message.error(err instanceof Error ? err.message : "操作失败");

  return (
    <ModalForm
      name="new-user"
      form={form}
      title="新建用户"
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{ status: 1 }}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: "确定",
      }}
      onFinish={async (values) => {
        const normalizedUsername = trimInput(values.username);
        const normalizedName = trimInput(values.name);
        try {
          const res = await createUser({
            username: normalizedUsername,
            name: normalizedName,
            userType: values.userType,
            password: values.password || undefined,
            mobile: values.mobile || null,
            wxId: values.wxId || null,
            status: values.status,
            customAttributes: form.getFieldsValue().customAttributes,
          });
          message.success("创建成功");
          if (res.result.generatedPassword) {
            showGeneratedPassword({
              title: "用户创建成功 — 初始密码",
              password: res.result.generatedPassword,
            });
          }
          onSuccess?.(res.result.user.username);
          return true;
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            onCommitted(err, normalizedUsername, !values.password);
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
        rules={[
          {
            transform: trimInput,
            required: true,
            whitespace: true,
            message: "请输入用户名",
          },
          {
            transform: trimInput,
            max: 64,
            message: "用户名最多64个字符",
          },
        ]}
      />
      <UserProfileFields />
      <ProFormText name="wxId" label="微信 ID" />
      <ProFormText.Password name="password" label="初始密码" placeholder="留空则后端生成随机密码" />
      <ProFormSelect
        name="status"
        label="状态"
        options={getUserStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
      {attributes.status === "loading" && <p role="status">正在加载自定义属性…</p>}
      {attributes.status === "error" && (
        <Alert type="error" title="自定义属性加载失败" action={<Button onClick={reload}>重试</Button>} />
      )}
      {attributes.status === "ready" && <CustomAttributeFields definitions={attributes.definitions} />}
    </ModalForm>
  );
}
