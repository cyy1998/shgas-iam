import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { RoleDetailVo, RoleUpdateInput } from "@admin/services/role";
import { Button, Descriptions, Space, Typography, theme } from "antd";
import RoleProfileForm from "./RoleProfileForm";

type Props = {
  detail: RoleDetailVo;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: RoleUpdateInput) => Promise<boolean>;
};

export default function RoleBasicInformation({ detail, editing, saving, onEdit, onCancel, onSave }: Props) {
  const { token } = theme.useToken();
  const codeItem = { key: "code", label: "角色编码", style: { width: "50%" }, children: detail.roleCode };
  const clientItem = {
    key: "client",
    label: "所属应用",
    style: { width: "50%" },
    children: `${detail.client.clientName}（${detail.client.clientCode}）`,
  };

  return (
    <section
      aria-label="基本信息"
      className={`${styles.section} ${styles["basic-section"]}`}
      style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
    >
      <div className={styles["section-header"]}>
        <Typography.Title level={5} className={styles["section-title"]}>
          基本信息
        </Typography.Title>
        {!editing && !saving && (
          <Button type="link" size="small" onClick={onEdit}>
            编辑
          </Button>
        )}
      </div>
      <Descriptions
        className={styles.descriptions}
        column={{ xs: 1, sm: 2 }}
        size="middle"
        styles={{ label: { fontSize: 13 }, content: { fontSize: 14, lineHeight: "24px", overflowWrap: "anywhere" } }}
        items={
          editing
            ? [codeItem, clientItem]
            : [
                { key: "name", label: "角色名称", style: { width: "50%" }, children: detail.roleName },
                codeItem,
                clientItem,
                { key: "count", label: "分配对象", children: `${detail.assignmentCount} 个` },
                {
                  key: "description",
                  label: "描述",
                  span: "filled",
                  children: <span className={styles.description}>{detail.description || "—"}</span>,
                },
              ]
        }
      />
      {editing && <RoleProfileForm detail={detail} saving={saving} onCancel={onCancel} onSave={onSave} />}
      <Space className={styles.metadata} size={[20, 4]} wrap style={{ borderColor: token.colorBorderSecondary }}>
        <Typography.Text type="secondary">创建于 {new Date(detail.createTime).toLocaleString()}</Typography.Text>
        <Typography.Text type="secondary">更新于 {new Date(detail.updateTime).toLocaleString()}</Typography.Text>
      </Space>
    </section>
  );
}
