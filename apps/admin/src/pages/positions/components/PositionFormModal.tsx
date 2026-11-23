import CustomAttributeFields from "@admin/components/custom-attributes/CustomAttributeFields";
import { getCustomAttributeFormPatch } from "@admin/components/custom-attributes/custom-attribute-form";
import { useCustomAttributeDefinitions } from "@admin/components/custom-attributes/useCustomAttributeDefinitions";
import { createPosition, type PositionDetailVo, updatePosition } from "@admin/services/position";
import { ModalForm, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { getPositionStatusOptions } from "@iam/contracts";
import { Alert, Button, Form, message } from "antd";

type Props = {
  open: boolean;
  initialValues?: PositionDetailVo | null;
  canManageCustomAttributes?: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const trimInput = (value: string | undefined) => value?.trim();

export default function PositionFormModal({
  open,
  initialValues,
  canManageCustomAttributes = false,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;
  const [form] = Form.useForm<Parameters<typeof createPosition>[0]>();
  const loadDefinitions = open && canManageCustomAttributes && !isEdit;
  const { state: attributes, reload } = useCustomAttributeDefinitions("position", loadDefinitions);
  const definitions = isEdit
    ? (initialValues?.customAttributeDefinitions ?? [])
    : loadDefinitions && attributes.status === "ready"
      ? attributes.definitions
      : [];

  return (
    <ModalForm
      form={form}
      title={isEdit ? "编辑岗位" : "新建岗位"}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        initialValues
          ? {
              posCode: initialValues.posCode,
              posName: initialValues.posName,
              description: initialValues.description ?? "",
              status: initialValues.status,
              customAttributes: initialValues.customAttributes,
            }
          : { status: 1 }
      }
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: "确定",
      }}
      onFinish={async (values) => {
        const customAttributes = getCustomAttributeFormPatch(form, definitions, form.getFieldsValue().customAttributes);
        const attributePatch = customAttributes === undefined ? {} : { customAttributes };
        try {
          if (initialValues) {
            const outcome = await updatePosition(initialValues.posCode, {
              ...attributePatch,
              posName: values.posName.trim(),
              description: values.description || null,
              ...(values.status !== initialValues.status ? { status: values.status } : {}),
            });
            message.success(outcome.changed ? "更新成功" : "无需修改");
          } else {
            const outcome = await createPosition({
              ...attributePatch,
              posCode: values.posCode.trim(),
              posName: values.posName.trim(),
              description: values.description || undefined,
              status: values.status,
            });
            message.success(outcome.changed ? "创建成功" : "无需修改");
          }
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : "操作失败");
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
            message: "请输入岗位编码",
          },
          {
            transform: trimInput,
            max: 64,
            message: "岗位编码最多64个字符",
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
            message: "请输入岗位名称",
          },
          {
            transform: trimInput,
            max: 128,
            message: "岗位名称最多128个字符",
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
      {loadDefinitions && attributes.status === "loading" && <p role="status">正在加载自定义属性…</p>}
      {loadDefinitions && attributes.status === "error" && (
        <Alert type="error" title="自定义属性加载失败" action={<Button onClick={reload}>重试</Button>} />
      )}
      <CustomAttributeFields definitions={definitions} />
    </ModalForm>
  );
}
