import type {
  CustomAttributeDefinition,
  CustomAttributeValue,
  CustomAttributeValues,
} from "@iam/contracts/custom-attributes";
import { useId } from "react";
import styles from "./CustomAttributes.module.less";

function renderValue(definition: CustomAttributeDefinition, value: CustomAttributeValue) {
  if (Array.isArray(value))
    return (
      <ol className={styles["value-list"]}>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Displayed values can repeat and are identified by position.
          <li key={index} className={styles["value-text"]}>
            {item}
          </li>
        ))}
      </ol>
    );
  if (typeof value === "boolean") return value ? "是" : "否";
  if (definition.valueType === "single_select") {
    const option = definition.options.find(({ code }) => code === value);
    if (option) return option.enabled ? option.displayName : `${option.displayName}（已停用）`;
  }
  return typeof value === "string" ? <span className={styles["value-text"]}>{value}</span> : value;
}

export default function CustomAttributeDetails({
  definitions,
  values,
}: {
  definitions: readonly CustomAttributeDefinition[];
  values: CustomAttributeValues;
}) {
  const titleId = useId();
  const items = definitions.flatMap((definition) => {
    const value = Object.hasOwn(values, definition.code) ? values[definition.code] : undefined;
    if (!definition.enabled || value === undefined) return [];
    return [{ key: definition.code, label: definition.displayName, children: renderValue(definition, value) }];
  });
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className={styles.detail}>
      <h4 id={titleId} className={styles["section-title"]}>
        自定义属性
      </h4>
      <dl className={styles["detail-grid"]}>
        {items.map(({ key, label, children }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{children}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
