import {
  type AdmissionReferenceKind,
  type AdmissionReferenceStatus,
  checkAdmissionReference,
} from "@admin/services/client-admission";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Input, InputNumber, Select, Typography } from "antd";
import { useEffect, useId, useState } from "react";
import styles from "./ClientAdmissionSettings.module.less";
import {
  type ConditionDraft,
  type ConditionKind,
  changeKind,
  draftValue,
  fieldDraft,
  operators,
} from "./client-admission-draft";
import type { ConditionField, ConditionScope, ConditionValue } from "./client-admission-fields";

const groupKinds: { label: string; value: ConditionKind }[] = [
  { label: "字段比较", value: "field" },
  { label: "全部满足", value: "and" },
  { label: "任一满足", value: "or" },
  { label: "排除", value: "not" },
];

type EditorProps = {
  clientCode: string;
  scope: ConditionScope;
  draft: ConditionDraft;
  disabled: boolean;
  onChange: (draft: ConditionDraft) => void;
  onRemove?: () => void;
};

export function ClientAdmissionConditionEditor({
  clientCode,
  scope,
  draft,
  disabled,
  onChange,
  onRemove,
}: EditorProps) {
  const kindId = useId();
  const collections = Object.entries(scope.collections).map(([path, { label }]) => ({
    label,
    value: `exists:${path}` as const,
  }));
  const collection = draft.kind === "exists" ? scope.collections[draft.path] : undefined;
  const kind: ConditionKind = draft.kind === "exists" ? `exists:${draft.path}` : draft.kind;
  return (
    <div className={styles["condition-node"]}>
      <div className={styles["node-header"]}>
        <div className={styles.field}>
          <label htmlFor={kindId}>条件类型</label>
          <Select<ConditionKind>
            id={kindId}
            aria-label="条件类型"
            options={[...groupKinds, ...collections]}
            value={kind}
            disabled={disabled}
            onChange={(value) => onChange({ ...changeKind(value, scope), id: draft.id })}
          />
        </div>
        {onRemove && (
          <Button
            type="text"
            title="删除子条件"
            aria-label="删除子条件"
            icon={<DeleteOutlined aria-hidden="true" />}
            disabled={disabled}
            onClick={onRemove}
          />
        )}
      </div>
      {draft.kind === "field" ? (
        <FieldComparison {...{ clientCode, scope, draft, disabled, onChange }} />
      ) : draft.kind === "exists" ? (
        collection && (
          <>
            {collection.hint && <Typography.Text type="secondary">{collection.hint}</Typography.Text>}
            <div className={styles.branches}>
              <ClientAdmissionConditionEditor
                clientCode={clientCode}
                scope={collection.scope}
                draft={draft.child}
                disabled={disabled}
                onChange={(child) => onChange({ ...draft, child })}
              />
            </div>
          </>
        )
      ) : (
        <>
          <div className={styles.branches}>
            {draft.children.map((child, index) => (
              <ClientAdmissionConditionEditor
                key={child.id}
                {...{ clientCode, scope, disabled }}
                draft={child}
                onChange={(value) =>
                  onChange({
                    ...draft,
                    children: draft.children.map((item, i) => (i === index ? value : item)),
                  })
                }
                onRemove={
                  draft.children.length > 1
                    ? () =>
                        onChange({
                          ...draft,
                          children: draft.children.filter((_, i) => i !== index),
                        })
                    : undefined
                }
              />
            ))}
          </div>
          {draft.kind !== "not" && (
            <Button
              className={styles["add-condition"]}
              type="dashed"
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={disabled}
              onClick={() => onChange({ ...draft, children: [...draft.children, fieldDraft(scope)] })}
            >
              添加子条件
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function FieldComparison({
  clientCode,
  scope,
  draft,
  disabled,
  onChange,
}: Omit<EditorProps, "draft"> & { draft: Extract<ConditionDraft, { kind: "field" }> }) {
  const id = useId();
  const fieldId = `${id}-field`;
  const operatorId = `${id}-operator`;
  const field = scope.fields[draft.field];
  if (!field) return null;
  const valueLabel = draft.field === "userType" ? field.label : "条件值";
  return (
    <>
      <div className={styles.comparison}>
        <div className={styles.field}>
          <label htmlFor={fieldId}>字段</label>
          <Select
            id={fieldId}
            aria-label="字段"
            options={Object.entries(scope.fields).map(([value, { label }]) => ({ value, label }))}
            value={draft.field}
            disabled={disabled}
            onChange={(value) => onChange({ ...fieldDraft(scope, value), id: draft.id })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={operatorId}>运算符</label>
          <Select
            id={operatorId}
            aria-label="运算符"
            options={operators(scope, draft.field)}
            value={draft.op}
            disabled={disabled}
            onChange={(op) => onChange({ ...draft, op, values: op === "eq" ? draft.values.slice(0, 1) : draft.values })}
          />
        </div>
        <div className={styles.values}>
          <label htmlFor={`${id}-value-${draft.values[0]?.id}`}>{valueLabel}</label>
          {draft.values.map(({ id: valueId, value }) => (
            <div className={styles["value-item"]} key={valueId}>
              <div className={styles["value-row"]}>
                <ConditionValueInput
                  id={`${id}-value-${valueId}`}
                  label={valueLabel}
                  {...{ field, value, disabled }}
                  onChange={(updated) =>
                    onChange({
                      ...draft,
                      values: draft.values.map((item) =>
                        item.id === valueId ? { id: valueId, value: updated } : item,
                      ),
                    })
                  }
                />
                {draft.values.length > 1 && (
                  <Button
                    type="text"
                    title="删除值"
                    aria-label="删除值"
                    icon={<DeleteOutlined aria-hidden="true" />}
                    disabled={disabled}
                    onClick={() => onChange({ ...draft, values: draft.values.filter((item) => item.id !== valueId) })}
                  />
                )}
              </div>
              {field.reference && typeof value === "string" && (
                <ReferenceStatus kind={field.reference} code={value} clientCode={clientCode} />
              )}
            </div>
          ))}
          {draft.op !== "eq" && (
            <Button
              type="dashed"
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={disabled}
              onClick={() => onChange({ ...draft, values: [...draft.values, draftValue()] })}
            >
              添加值
            </Button>
          )}
        </div>
      </div>
      {field.nullable && (
        <Typography.Text type="secondary">{field.label}未填写时比较结果为假，外层排除后可为真。</Typography.Text>
      )}
      {field.reference === "role" && (
        <Typography.Text type="secondary">仅匹配该应用的有效角色和有效全局角色。</Typography.Text>
      )}
      {field.validate && draft.values.some(({ value }) => value !== undefined && !field.validate?.(value)) && (
        <Typography.Text type="danger">请输入有效的主体标识（UUID）。</Typography.Text>
      )}
    </>
  );
}

function ConditionValueInput({
  id,
  label,
  field,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  field: ConditionField;
  value?: ConditionValue;
  disabled: boolean;
  onChange: (value: ConditionValue | undefined) => void;
}) {
  if (field.options) {
    return (
      <Select
        id={id}
        aria-label={label}
        options={field.options}
        placeholder="选择值"
        {...{ value, disabled, onChange }}
      />
    );
  }
  if (field.integer) {
    return (
      <InputNumber
        id={id}
        aria-label={label}
        min={0}
        precision={0}
        value={typeof value === "number" ? value : null}
        disabled={disabled}
        onChange={(number) => onChange(number ?? undefined)}
      />
    );
  }
  return (
    <Input
      id={id}
      aria-label={label}
      placeholder={field.reference ? "输入精确编码" : "输入精确值"}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const referenceLabels = { organization: "组织", position: "岗位", role: "角色" };

function ReferenceStatus({
  kind,
  code,
  clientCode,
}: {
  kind: AdmissionReferenceKind;
  code: string;
  clientCode: string;
}) {
  const [checked, setChecked] = useState<{
    kind: AdmissionReferenceKind;
    code: string;
    clientCode: string;
    status: AdmissionReferenceStatus;
  }>();
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void checkAdmissionReference(kind, code, clientCode).then((status) => {
        if (current) setChecked({ kind, code, clientCode, status });
      });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, code, clientCode]);

  if (checked?.kind !== kind || checked.code !== code || checked.clientCode !== clientCode) return null;
  if (checked.status === "missing") {
    return (
      <Typography.Text type="warning">
        找不到{referenceLabels[kind]}编码「{code}」，仍按此编码匹配已发布文档。
      </Typography.Text>
    );
  }
  if (checked.status === "unavailable") {
    return <Typography.Text type="secondary">暂时无法核对{referenceLabels[kind]}编码。</Typography.Text>;
  }
  return null;
}
