import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { RoleDetailVo, RoleUpdateInput } from "@admin/services/role";
import { Button, Descriptions, Space, Typography, theme } from "antd";
import roleStyles from "./RoleDetailDrawer.module.less";
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
  const codeItem = { key: "code", label: "角色编码", children: detail.roleCode };
  const clientItem = {
    key: "client",
    label: "所属应用",
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
      {editing ? (
        <dl className={roleStyles["edit-identity"]}>
          <div>
            <dt>角色编码</dt>
            <dd>{detail.roleCode}</dd>
          </div>
          <div>
            <dt>所属应用</dt>
            <dd>{clientItem.children}</dd>
          </div>
        </dl>
      ) : (
        <Descriptions
          className={`${styles.descriptions} ${roleStyles["basic-descriptions"]}`}
          column={{ xs: 1, sm: 2 }}
          size="small"
          colon={false}
          styles={{
            label: { width: 80, minWidth: 80, flexShrink: 0, fontSize: 13, lineHeight: "24px" },
            content: { minWidth: 0, fontSize: 14, lineHeight: "24px", overflowWrap: "anywhere" },
          }}
          items={[
            { key: "name", label: "角色名称", children: detail.roleName },
            codeItem,
            clientItem,
            { key: "count", label: "分配对象", children: `${detail.assignmentCount} 个` },
            {
              key: "description",
              label: "描述",
              span: "filled",
              children: <span className={styles.description}>{detail.description || "—"}</span>,
            },
          ]}
        />
      )}
      {editing && <RoleProfileForm detail={detail} saving={saving} onCancel={onCancel} onSave={onSave} />}
      <Space
        className={`${styles.metadata} ${roleStyles["basic-metadata"]}`}
        size={[editing ? 24 : 0, 4]}
        wrap
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <Typography.Text type="secondary">创建于 {new Date(detail.createTime).toLocaleString()}</Typography.Text>
        <Typography.Text type="secondary">更新于 {new Date(detail.updateTime).toLocaleString()}</Typography.Text>
      </Space>
    </section>
  );
}
