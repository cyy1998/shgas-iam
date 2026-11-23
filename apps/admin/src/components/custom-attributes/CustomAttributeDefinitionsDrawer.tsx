import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  createCustomAttributeDefinition,
  setCustomAttributeDefinitionEnabled,
  updateCustomAttributeDefinition,
} from "@admin/services/custom-attribute";
import { PlusOutlined } from "@ant-design/icons";
import type {
  CustomAttributeDefinition,
  CustomAttributeEntityType,
  CustomAttributeOption,
} from "@iam/contracts/custom-attributes";
import { CustomAttributeCodeSchema, CustomAttributeValueTypeSchema } from "@iam/contracts/custom-attributes";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from "antd";
import { useId, useState } from "react";
import styles from "./CustomAttributes.module.less";
import { useCustomAttributeDefinitions } from "./useCustomAttributeDefinitions";

const valueTypeLabels = {
  text: "文本",
  number: "数字",
  boolean: "布尔",
  date: "日期",
  single_select: "单选",
  text_list: "有序文本列表",
} satisfies Record<CustomAttributeDefinition["valueType"], string>;

const entityTypeLabels = { user: "用户", organization: "组织", position: "岗位" } satisfies Record<
  CustomAttributeEntityType,
  string
>;

type DefinitionFormValues = Pick<
  CustomAttributeDefinition,
  "code" | "valueType" | "displayName" | "description" | "orderNum" | "options"
>;
type Editing = { kind: "create" } | { kind: "edit"; definition: CustomAttributeDefinition };

function codeRule(_: unknown, value: unknown) {
  const parsed = CustomAttributeCodeSchema.safeParse(value);
  return parsed.success ? Promise.resolve() : Promise.reject(new Error(parsed.error.issues[0]?.message));
}

function DefinitionForm({
  id,
  entityType,
  definition,
  saving,
  onCancel,
  onSave,
}: {
  id: string;
  entityType: CustomAttributeEntityType;
  definition?: CustomAttributeDefinition;
  saving: boolean;
  onCancel: () => void;
  onSave: (operation: () => Promise<{ changed: boolean }>) => Promise<void>;
}) {
  const [form] = Form.useForm<DefinitionFormValues>();
  const valueType = Form.useWatch("valueType", form);

  return (
    <Form<DefinitionFormValues>
      id={id}
      name="custom-attribute-definition"
      className={styles.editor}
      layout="vertical"
      form={form}
      disabled={saving}
      initialValues={definition ?? { valueType: "text", orderNum: 0, options: [] }}
      onFinish={async (input) => {
        const description = input.description?.trim() || null;
        const orderNum = input.orderNum ?? 0;
        const options = input.valueType === "single_select" ? (input.options ?? []) : [];
        if (!definition) {
          await onSave(() => createCustomAttributeDefinition({ ...input, entityType, description, orderNum, options }));
          return;
        }
        const existingOptions = new Map(definition.options.map((option) => [option.code, option]));
        const changedOptions = options.filter((option) => {
          const before = existingOptions.get(option.code);
          return before?.displayName !== option.displayName || before.enabled !== option.enabled;
        });
        const patch = {
          ...(input.displayName !== definition.displayName ? { displayName: input.displayName } : {}),
          ...(description !== definition.description ? { description } : {}),
          ...(orderNum !== definition.orderNum ? { orderNum } : {}),
          ...(changedOptions.length > 0 ? { options: changedOptions } : {}),
        };
        if (Object.keys(patch).length === 0) {
          onCancel();
          return;
        }
        await onSave(() => updateCustomAttributeDefinition({ entityType, code: definition.code, patch }));
      }}
    >
      <div className={styles["editor-grid"]}>
        <Form.Item name="displayName" label="显示名称" rules={[{ required: true, whitespace: true, max: 128 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="code" label="属性编码" rules={[{ required: true, validator: codeRule }]}>
          <Input disabled={definition !== undefined} />
        </Form.Item>
        <Form.Item name="valueType" label="属性类型" rules={[{ required: true }]}>
          <Select
            disabled={definition !== undefined}
            options={CustomAttributeValueTypeSchema.options.map((value) => ({ value, label: valueTypeLabels[value] }))}
          />
        </Form.Item>
        <Form.Item name="orderNum" label="显示顺序" rules={[{ type: "integer", min: -2147483648, max: 2147483647 }]}>
          <InputNumber className={styles["full-width"]} precision={0} />
        </Form.Item>
      </div>
      <Form.Item name="description" label="说明" rules={[{ max: 1024 }]}>
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
      </Form.Item>
      {valueType === "single_select" && (
        <Form.List
          name="options"
          rules={[
            {
              async validator(_, options: CustomAttributeOption[] | undefined) {
                const codes = options?.map((option) => option.code) ?? [];
                if (new Set(codes).size !== codes.length) throw new Error("单选选项编码重复");
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <div className={styles.options}>
              <div className={styles["option-header"]}>
                <h4 className={styles["option-title"]}>单选选项</h4>
                <Button size="small" icon={<PlusOutlined aria-hidden />} onClick={() => add({ enabled: true })}>
                  添加选项
                </Button>
              </div>
              {fields.map(({ key, name }) => (
                <div key={key} className={styles["option-row"]}>
                  <div className={styles["option-fields"]}>
                    <Form.Item name={[name, "code"]} label="选项编码" rules={[{ required: true, validator: codeRule }]}>
                      <Input disabled={name < (definition?.options.length ?? 0)} />
                    </Form.Item>
                    <Form.Item
                      name={[name, "displayName"]}
                      label="选项名称"
                      rules={[{ required: true, whitespace: true, max: 128 }]}
                    >
                      <Input />
                    </Form.Item>
                  </div>
                  <div className={styles["option-actions"]}>
                    <div className={styles["option-toggle"]}>
                      <Form.Item name={[name, "enabled"]} valuePropName="checked" noStyle>
                        <Switch size="small" aria-label="启用选项" />
                      </Form.Item>
                      <Typography.Text type="secondary">启用选项</Typography.Text>
                    </div>
                    {name >= (definition?.options.length ?? 0) && (
                      <Button size="small" type="text" danger onClick={() => remove(name)}>
                        移除新选项
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Form.ErrorList errors={errors} />
            </div>
          )}
        </Form.List>
      )}
    </Form>
  );
}

export default function CustomAttributeDefinitionsDrawer({
  entityType,
  open,
  onClose,
}: {
  entityType: CustomAttributeEntityType;
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const { state, reload } = useCustomAttributeDefinitions(entityType, open);
  const [editing, setEditing] = useState<Editing>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const cancelEditing = () => {
    setEditing(undefined);
    setError(undefined);
  };
  const save = async (operation: () => Promise<{ changed: boolean }>) => {
    setSaving(true);
    setError(undefined);
    try {
      await operation();
      setEditing(undefined);
      reload();
    } catch (error) {
      if (error instanceof AdminMutationCommittedError) {
        setEditing(undefined);
        reload();
      }
      setError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="自定义属性定义"
      open={open}
      size="min(100vw, 640px)"
      classNames={{ body: styles["drawer-body"] }}
      onClose={() => {
        if (saving) return;
        cancelEditing();
        onClose();
      }}
      footer={
        editing && (
          <Space className={styles["footer-actions"]}>
            <Button onClick={cancelEditing} disabled={saving}>
              取消编辑
            </Button>
            <Button form={formId} htmlType="submit" type="primary" loading={saving}>
              保存定义
            </Button>
          </Space>
        )
      }
    >
      {error && <Alert type="error" title={error} showIcon />}
      {editing ? (
        <DefinitionForm
          id={formId}
          entityType={entityType}
          definition={editing.kind === "edit" ? editing.definition : undefined}
          saving={saving}
          onSave={save}
          onCancel={cancelEditing}
        />
      ) : (
        <div className={styles["drawer-list"]}>
          <div className={styles.toolbar}>
            <Typography.Text type="secondary">
              {entityTypeLabels[entityType]}属性{state.status === "ready" && ` · 共 ${state.definitions.length} 项`}
            </Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              disabled={state.status !== "ready" || saving}
              onClick={() => {
                setEditing({ kind: "create" });
                setError(undefined);
              }}
            >
              新建属性定义
            </Button>
          </div>
          {state.status === "loading" && (
            <div className={styles["list-state"]}>
              <Spin aria-label="正在加载自定义属性定义" />
            </div>
          )}
          {state.status === "error" && (
            <Alert type="error" title="自定义属性定义加载失败" action={<Button onClick={reload}>重试</Button>} />
          )}
          {state.status === "ready" && state.definitions.length === 0 && (
            <div className={styles["list-state"]}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无自定义属性定义" />
            </div>
          )}
          {state.status === "ready" && state.definitions.length > 0 && (
            <ul className={styles.list}>
              {state.definitions.map((definition) => (
                <li className={styles["list-item"]} key={definition.code}>
                  <div className={styles["definition-text"]}>
                    <Space size={[8, 4]} wrap>
                      <span className={styles["definition-name"]}>{definition.displayName}</span>
                      <Tag color={definition.enabled ? "success" : undefined}>
                        {definition.enabled ? "已启用" : "已停用"}
                      </Tag>
                    </Space>
                    <div className={styles["definition-meta"]}>
                      <Space size={[8, 4]} wrap>
                        <Typography.Text code>{definition.code}</Typography.Text>
                        <Typography.Text type="secondary">{valueTypeLabels[definition.valueType]}</Typography.Text>
                        <Typography.Text type="secondary">顺序 {definition.orderNum}</Typography.Text>
                      </Space>
                    </div>
                    {definition.description && (
                      <p className={styles["definition-description"]}>{definition.description}</p>
                    )}
                  </div>
                  <Space className={styles["definition-actions"]} size={4}>
                    <Button
                      size="small"
                      type="text"
                      disabled={saving}
                      onClick={() => {
                        setEditing({ kind: "edit", definition });
                        setError(undefined);
                      }}
                    >
                      编辑定义
                    </Button>
                    <Button
                      size="small"
                      type="text"
                      disabled={saving}
                      onClick={() =>
                        void save(() =>
                          setCustomAttributeDefinitionEnabled({
                            entityType,
                            code: definition.code,
                            enabled: !definition.enabled,
                          }),
                        )
                      }
                    >
                      {definition.enabled ? "停用" : "启用"}
                    </Button>
                  </Space>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  );
}
