import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { EmploymentDetailVo } from "@admin/services/employment";
import { ProForm } from "@ant-design/pro-components";
import { Button, Space } from "antd";
import { useState } from "react";
import EmploymentDateFields from "./EmploymentDateFields";

type EmploymentPeriod = Pick<EmploymentDetailVo, "startTime" | "endTime">;
type EmploymentPeriodPatch = Partial<EmploymentPeriod>;

type Props = {
  period: EmploymentPeriod;
  saving: boolean;
  onSave: (patch: EmploymentPeriodPatch) => Promise<void>;
  onCancel: () => void;
};

export default function EmploymentPeriodForm({ period, saving, onSave, onCancel }: Props) {
  const [initialPeriod] = useState(() => ({ ...period }));
  return (
    <ProForm<{ startTime?: string; endTime?: string }>
      name="employment-period"
      layout="vertical"
      disabled={saving}
      submitter={false}
      initialValues={{ startTime: initialPeriod.startTime ?? "", endTime: initialPeriod.endTime ?? "" }}
      onFinish={async ({ startTime, endTime }) => {
        const patch: EmploymentPeriodPatch = {};
        const start = startTime || null;
        const end = endTime || null;
        if (start !== initialPeriod.startTime) patch.startTime = start;
        if (end !== initialPeriod.endTime) patch.endTime = end;
        if (patch.startTime === undefined && patch.endTime === undefined) {
          onCancel();
          return;
        }
        await onSave(patch);
      }}
    >
      <EmploymentDateFields />
      <Space size={8} className={styles["form-actions"]}>
        <Button type="primary" htmlType="submit" loading={saving}>
          保存
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </Space>
    </ProForm>
  );
}
