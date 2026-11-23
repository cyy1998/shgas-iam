import { ProForm } from "@ant-design/pro-components";
import type { CustomAttributeDefinition, CustomAttributeValue } from "@iam/contracts/custom-attributes";
import { Button, Input, InputNumber, Select, Space } from "antd";
import { useId } from "react";
import styles from "./CustomAttributes.module.less";

type FieldProps = {
  definition: CustomAttributeDefinition;
  id?: string;
  value?: CustomAttributeValue | null;
  onChange?: (value: CustomAttributeValue | null) => void;
};

function ValueField({ definition, id, value, onChange }: FieldProps) {
  const listId = useId();
  switch (definition.valueType) {
    case "text":
      return (
        <Input.TextArea
          id={id}
          value={typeof value === "string" ? value : ""}
          autoSize
          onChange={(event) => onChange?.(event.target.value)}
        />
      );
    case "number":
      return (
        <InputNumber
          id={id}
          className={styles["full-width"]}
          value={typeof value === "number" ? value : null}
          onChange={(next) => onChange?.(next)}
        />
      );
    case "boolean":
      return (
        <Select
          id={id}
          allowClear
          value={typeof value === "boolean" ? String(value) : undefined}
          options={[
            { value: "true", label: "是" },
            { value: "false", label: "否" },
          ]}
          onChange={(next: string | undefined) => onChange?.(next === undefined ? null : next === "true")}
        />
      );
    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange?.(event.target.value || null)}
        />
      );
    case "single_select":
      return (
        <Select
          id={id}
          allowClear
          value={typeof value === "string" ? value : undefined}
          options={definition.options.map((option) => ({
            value: option.code,
            label: option.enabled ? option.displayName : `${option.displayName}（已停用）`,
            disabled: !option.enabled,
          }))}
          onChange={(next: string | undefined) => onChange?.(next ?? null)}
        />
      );
    case "text_list": {
      const items = Array.isArray(value) ? value : [];
      return (
        <Space orientation="vertical" className={styles["full-width"]}>
          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: List items have no identity beyond their position.
            <Space.Compact key={`${listId}-${index}`} block>
              <Input.TextArea
                id={index === 0 ? id : undefined}
                aria-label={`${definition.displayName} 第 ${index + 1} 项`}
                value={item}
                autoSize
                onChange={(event) =>
                  onChange?.(items.map((previous, offset) => (offset === index ? event.target.value : previous)))
                }
              />
              <Button
                onClick={() => onChange?.(items.filter((_, offset) => offset !== index))}
                aria-label={`删除${definition.displayName}第 ${index + 1} 项`}
              >
                删除
              </Button>
            </Space.Compact>
          ))}
          <Button id={items.length === 0 ? id : undefined} onClick={() => onChange?.([...items, ""])}>
            添加{definition.displayName}项
          </Button>
        </Space>
      );
    }
  }
}

export default function CustomAttributeFields({ definitions }: { definitions: readonly CustomAttributeDefinition[] }) {
  const titleId = useId();
  const enabledDefinitions = definitions.filter((definition) => definition.enabled);
  if (enabledDefinitions.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className={styles.fields}>
      <h4 id={titleId} className={styles["section-title"]}>
        自定义属性
      </h4>
      {enabledDefinitions.map((definition) => (
        <ProForm.Item
          name={["customAttributes", definition.code]}
          label={definition.displayName}
          extra={definition.description ?? undefined}
          key={definition.code}
        >
          <ValueField definition={definition} />
        </ProForm.Item>
      ))}
    </section>
  );
}
