import type { RoleDetailVo, RoleUpdateInput } from "@admin/services/role";
import { getRoleStatusOptions, RoleKind } from "@iam/contracts";
import { Button, Col, ConfigProvider, Form, Input, message, Row, Select, Space } from "antd";
import { useState } from "react";
import styles from "./RoleDetailDrawer.module.less";
import { RoleInclusionEditor } from "./RoleInclusions";

type Props = {
  detail: RoleDetailVo;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: RoleUpdateInput) => Promise<boolean>;
};

type ProfileValues = Pick<RoleDetailVo, "roleName" | "status"> & { description: string };

export default function RoleProfileForm({ detail, saving, onCancel, onSave }: Props) {
  const [form] = Form.useForm<ProfileValues>();
  const [originalMembers] = useState(detail.members);
  const [members, setMembers] = useState(originalMembers);

  return (
    <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 16, labelFontSize: 13 } } }}>
      <Form<ProfileValues>
        name="role-profile"
        className={styles.profile}
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
          if (detail.roleKind === RoleKind.Composite) {
            const originalIds = new Set(originalMembers.map(({ id }) => id));
            const currentIds = new Set(members.map(({ id }) => id));
            const addRoleIds = [...currentIds].filter((id) => !originalIds.has(id));
            const removeRoleIds = [...originalIds].filter((id) => !currentIds.has(id));
            if (addRoleIds.length || removeRoleIds.length) data.inclusions = { addRoleIds, removeRoleIds };
          }
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
        {detail.roleKind === RoleKind.Composite && (
          <RoleInclusionEditor containerId={detail.id} members={members} onChange={setMembers} />
        )}
        <Space size={8} className={styles["profile-actions"]}>
          <Button onClick={onCancel} disabled={saving}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存
          </Button>
        </Space>
      </Form>
    </ConfigProvider>
  );
}
