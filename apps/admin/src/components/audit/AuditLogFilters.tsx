import { FilterOutlined } from "@ant-design/icons";
import { Button, Checkbox, DatePicker, Input, Select } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import styles from "./AuditLogFilters.module.less";
import { actorTypeLabels, auditActionOptions, outcomeLabels, targetTypeLabels } from "./auditLogDisplay";

export type AuditLogFilterValues = {
  eventTimeRange?: [string, string];
  actions?: string[];
  outcome?: string;
  actorType?: string;
  actorKeyword?: string;
  targetType?: string;
  targetKeyword?: string;
  requestId?: string;
  traceId?: string;
};

const textFields = [
  { key: "actorKeyword", label: "操作者", placeholder: "用户名 / client / system" },
  { key: "targetKeyword", label: "目标对象", placeholder: "目标编码 / ID" },
  { key: "requestId", label: "Request ID", placeholder: "Request ID" },
  { key: "traceId", label: "Trace ID", placeholder: "Trace ID" },
] as const;

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export default function AuditLogFilters({
  values,
  onChange,
}: {
  values: AuditLogFilterValues;
  onChange: (values: AuditLogFilterValues) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<(typeof textFields)[number]["key"], string>>>({});
  const update = (patch: Partial<AuditLogFilterValues>) => onChange({ ...values, ...patch });
  const moreCount = [
    values.actorType,
    values.actorKeyword,
    values.targetType,
    values.targetKeyword,
    values.requestId,
    values.traceId,
  ].filter(Boolean).length;
  const hasFilters = Object.values(values).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
  return (
    <div className={styles.filters}>
      <div className={styles.primary}>
        <DatePicker.RangePicker
          className={styles.range}
          aria-label="时间范围"
          placeholder={["开始时间", "结束时间"]}
          showTime
          format="YYYY-MM-DD HH:mm:ss"
          value={values.eventTimeRange ? [dayjs(values.eventTimeRange[0]), dayjs(values.eventTimeRange[1])] : null}
          onChange={(range) =>
            update({
              eventTimeRange: range?.[0] && range[1] ? [range[0].toISOString(), range[1].toISOString()] : undefined,
            })
          }
        />
        <Select
          className={styles.actions}
          aria-label="动作"
          placeholder="全部动作"
          mode="multiple"
          allowClear
          showSearch
          maxTagCount="responsive"
          optionFilterProp="label"
          options={auditActionOptions}
          value={values.actions}
          onChange={(actions) => update({ actions })}
          menuItemSelectedIcon={({ isSelected }) => <Checkbox checked={isSelected} style={{ pointerEvents: "none" }} />}
        />
        <Select
          className={styles.outcome}
          aria-label="结果"
          placeholder="全部结果"
          allowClear
          options={options(outcomeLabels)}
          value={values.outcome}
          onChange={(outcome) => update({ outcome })}
        />
        <Button
          type="text"
          icon={<FilterOutlined aria-hidden />}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          更多筛选{moreCount ? `（${moreCount}）` : ""}
        </Button>
        {hasFilters && (
          <Button
            type="text"
            onClick={() => {
              setDrafts({});
              onChange({});
            }}
          >
            清除筛选
          </Button>
        )}
      </div>
      {expanded && (
        <div className={styles.more}>
          <Select
            aria-label="操作者类型"
            placeholder="全部操作者类型"
            allowClear
            options={options(actorTypeLabels)}
            value={values.actorType}
            onChange={(actorType) => update({ actorType })}
          />
          <Select
            aria-label="目标类型"
            placeholder="全部目标类型"
            allowClear
            options={options(targetTypeLabels)}
            value={values.targetType}
            onChange={(targetType) => update({ targetType })}
          />
          {textFields.map(({ key, label, placeholder }) => (
            <Input.Search
              key={key}
              aria-label={label}
              placeholder={placeholder}
              allowClear
              value={drafts[key] ?? values[key] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
              onSearch={(value) => update({ [key]: value.trim() || undefined })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
