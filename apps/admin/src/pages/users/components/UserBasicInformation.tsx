import AuthorizationActionButton from "@admin/components/AuthorizationActionButton";
import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { UserDetailVo, updateUser } from "@admin/services/user";
import { Descriptions, Space, Tag, Typography, theme } from "antd";
import UserProfileForm from "./UserProfileForm";

type Props = {
  detail: UserDetailVo;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: Parameters<typeof updateUser>[1]) => Promise<boolean>;
};

export default function UserBasicInformation({ detail, editing, saving, onEdit, onCancel, onSave }: Props) {
  const { token } = theme.useToken();

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
          <AuthorizationActionButton
            decision={detail.allowedActions.editProfile}
            onClick={onEdit}
            type="link"
            size="small"
          >
            编辑
          </AuthorizationActionButton>
        )}
      </div>
      {editing && detail.allowedActions.editProfile.allowed ? (
        <UserProfileForm detail={detail} saving={saving} onCancel={onCancel} onSave={onSave} />
      ) : (
        <Descriptions
          className={styles.descriptions}
          size="middle"
          column={{ xs: 1, sm: 2 }}
          styles={{ label: { fontSize: 13 }, content: { fontSize: 14, lineHeight: "24px", overflowWrap: "anywhere" } }}
          items={[
            { key: "name", label: "姓名", children: detail.name },
            { key: "userType", label: "用户类型", children: detail.userType ?? "—" },
            { key: "mobile", label: "手机号", children: detail.mobile ?? "—" },
            { key: "wxId", label: "微信 ID", children: detail.wxId ?? "—" },
          ]}
        />
      )}
      <div className={styles["role-row"]}>
        <Typography.Text type="secondary" className={styles["field-label"]}>
          角色
        </Typography.Text>
        <div className={styles["role-list"]}>
          {detail.roles.length === 0 ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            detail.roles.map((code) => (
              <Tag key={code} className={styles["role-tag"]}>
                {detail.roleNames[code] || "未命名角色"}
              </Tag>
            ))
          )}
        </div>
      </div>
      <Space className={styles.metadata} size={[20, 4]} wrap style={{ borderColor: token.colorBorderSecondary }}>
        <Typography.Text type="secondary">创建于 {new Date(detail.createTime).toLocaleString()}</Typography.Text>
        <Typography.Text type="secondary">更新于 {new Date(detail.updateTime).toLocaleString()}</Typography.Text>
      </Space>
    </section>
  );
}
