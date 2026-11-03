import styles from "@admin/components/detail/DetailDrawer.module.less";
import { Button, Form, Input, Space } from "antd";

type Props = {
  description: string | null;
  saving: boolean;
  onSave: (description: string) => Promise<void>;
  onCancel: () => void;
};

export default function EmploymentDescriptionForm({ description, saving, onSave, onCancel }: Props) {
  return (
    <Form<{ description: string }>
      name="employment-description"
      layout="vertical"
      disabled={saving}
      initialValues={{ description: description ?? "" }}
      onFinish={(values) => onSave(values.description ?? "")}
    >
      <Form.Item name="description" label="备注" rules={[{ max: 500, message: "备注最多500个字符" }]}>
        <Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} />
      </Form.Item>
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
