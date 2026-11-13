import "dayjs/locale/zh-cn";
import { EmploymentDateSchema } from "@iam/contracts";
import { DatePicker, Form } from "antd";
import type { RangePickerProps } from "antd/es/date-picker";
import zhCN from "antd/es/date-picker/locale/zh_CN";
import dayjs from "dayjs";

export type EmploymentPeriodValue = [start: string | null, end: string | null];

type RangeInputProps = {
  id?: string;
  value?: EmploymentPeriodValue;
  onChange?: (value: EmploymentPeriodValue) => void;
};

function EmploymentPeriodPicker({ id, value, onChange }: RangeInputProps) {
  const [startTime, endTime] = value ?? [];
  const start = startTime ? dayjs(new Date(`${startTime}T00:00:00`)) : null;
  const end = endTime ? dayjs(new Date(`${endTime}T00:00:00`)) : null;
  const presets: RangePickerProps["presets"] = [];
  if (start) presets.push({ label: "清空开始日", value: [null, end] });
  if (end) presets.push({ label: "清空截止日", value: [start, null] });

  return (
    <DatePicker.RangePicker
      id={id}
      locale={zhCN}
      format="YYYY-MM-DD"
      placeholder={["开始日", "截止日"]}
      value={[start, end]}
      allowEmpty={[true, true]}
      inputReadOnly
      style={{ width: "100%" }}
      presets={presets}
      onChange={(dates, dateStrings) =>
        onChange?.(dates ? [dateStrings[0] || null, dateStrings[1] || null] : [null, null])
      }
    />
  );
}

export default function EmploymentPeriodField() {
  return (
    <Form.Item
      name="period"
      label="有效期"
      extra="按北京时间，包含开始日，截止日当天不生效。任一端可留空。"
      rules={[
        {
          validator: async (_: unknown, value?: EmploymentPeriodValue) => {
            const [start, end] = value ?? [];
            if (
              (start && !EmploymentDateSchema.safeParse(start).success) ||
              (end && !EmploymentDateSchema.safeParse(end).success)
            ) {
              throw new Error("请输入有效日期");
            }
            if (start && end && start >= end) throw new Error("开始日必须早于截止日");
          },
        },
      ]}
    >
      <EmploymentPeriodPicker />
    </Form.Item>
  );
}
