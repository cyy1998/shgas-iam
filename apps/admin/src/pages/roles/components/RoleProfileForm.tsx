import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { RoleDetailVo, RoleUpdateInput } from "@admin/services/role";
import { getRoleStatusOptions } from "@iam/contracts";
import { Button, Col, ConfigProvider, Form, Input, message, Row, Select, Space } from "antd";

type Props = {
  detail: RoleDetailVo;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: RoleUpdateInput) => Promise<boolean>;
};

type ProfileValues = Pick<RoleDetailVo, "roleName" | "status"> & { description: string };

export default function RoleProfileForm({ detail, saving, onCancel, onSave }: Props) {
  const [form] = Form.useForm<ProfileValues>();

  return (
    <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 20, labelFontSize: 13 } } }}>
      <Form<ProfileValues>
        name="role-profile"
        form={form}
        layout="vertical"
        size="middle"
        disabled={saving}
        initialValues={{ roleName: detail.roleName, status: detail.status, description: detail.description ?? "" }}
        onFinish={async (values) => {
          const data: RoleUpdateInput = {};
          if (form.isFieldTouched("roleName")) data.roleName = values.roleName.trim();
          if (form.isFieldTouched("description")) data.description = values.description || null;
          if (form.isFieldTouched("status") && values.status !== detail.status) data.status = values.status;
          if (Object.keys(data).length === 0) {
            message.info("请先编辑需要保存的字段");
            return;
          }
          await onSave(data);
        }}
      >
        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="roleName"
              label="角色名称"
              rules={[
                { required: true, whitespace: true, message: "请输入角色名称" },
                { max: 128, message: "角色名称最多128个字符" },
              ]}
            >
              <Input maxLength={128} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Select
                options={getRoleStatusOptions().map((option) => ({ label: option.label, value: option.value }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="description" label="描述" rules={[{ max: 500, message: "描述最多500个字符" }]}>
              <Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} />
            </Form.Item>
          </Col>
        </Row>
        <Space size={8} className={styles["form-actions"]}>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存
          </Button>
          <Button onClick={onCancel} disabled={saving}>
            取消
          </Button>
        </Space>
      </Form>
    </ConfigProvider>
  );
}
