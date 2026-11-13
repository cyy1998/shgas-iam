import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { EmploymentDetailVo, EmploymentUpdateParams } from "@admin/services/employment";
import { Button, Form, Input, Space } from "antd";
import { useState } from "react";
import EmploymentPeriodField, { type EmploymentPeriodValue } from "./EmploymentPeriodField";

type EditValues = { period?: EmploymentPeriodValue; description?: string };

type Props = {
  employment: Pick<EmploymentDetailVo, "startTime" | "endTime" | "description">;
  canEditPeriod: boolean;
  canEditDescription: boolean;
  saving: boolean;
  onSave: (patch: EmploymentUpdateParams) => Promise<void>;
  onCancel: () => void;
};

export default function EmploymentEditForm({
  employment,
  canEditPeriod,
  canEditDescription,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [initial] = useState(() => ({
    startTime: employment.startTime,
    endTime: employment.endTime,
    description: employment.description || null,
  }));
  return (
    <Form<EditValues>
      name="employment-edit"
      layout="vertical"
      disabled={saving}
      initialValues={{ period: [initial.startTime, initial.endTime], description: initial.description ?? "" }}
      onFinish={async ({ period, description }) => {
        const patch: EmploymentUpdateParams = {};
        if (canEditPeriod) {
          const [start, end] = period ?? [null, null];
          if (start !== initial.startTime) patch.startTime = start;
          if (end !== initial.endTime) patch.endTime = end;
        }
        const note = description || null;
        if (canEditDescription && note !== initial.description) patch.description = note;
        if (Object.keys(patch).length === 0) {
          onCancel();
          return;
        }
        await onSave(patch);
      }}
    >
      {canEditPeriod && <EmploymentPeriodField />}
      {canEditDescription && (
        <Form.Item name="description" label="备注" rules={[{ max: 500, message: "备注最多500个字符" }]}>
          <Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
      )}
      <Space size={8} className={styles["form-actions"]}>
        <Button type="primary" htmlType="submit" loading={saving}>
          保存
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </Space>
    </Form>
  );
}
