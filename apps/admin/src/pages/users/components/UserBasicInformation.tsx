import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { UserDetailVo, UserWecomExternalBinding, updateUser } from "@admin/services/user";
import { Button, Descriptions, Space, Tag, Typography, theme } from "antd";
import userStyles from "./UserDetail.module.less";
import UserProfileForm from "./UserProfileForm";

type Props = {
  detail: UserDetailVo;
  editing: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: Parameters<typeof updateUser>[1]) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
  onUnlinkWecom: (binding?: UserWecomExternalBinding) => void;
};

export default function UserBasicInformation({
  detail,
  editing,
  saving,
  onCancel,
  onSave,
  onDirtyChange,
  onUnlinkWecom,
}: Props) {
  const { token } = theme.useToken();
  const externalBindings = detail.externalWecomBindings ?? [];

  return (
    <section
      aria-label="基本信息"
      className={`${styles.section} ${styles["basic-section"]} ${userStyles["basic-section"]}`}
      style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}
    >
      <div className={styles["section-header"]}>
        <Typography.Title level={5} className={styles["section-title"]}>
          基本信息
        </Typography.Title>
        {editing && <Typography.Text type="secondary">编辑资料</Typography.Text>}
      </div>
      {editing && detail.allowedActions.editProfile.allowed ? (
        <UserProfileForm
          detail={detail}
          saving={saving}
          onCancel={onCancel}
          onSave={onSave}
          onDirtyChange={onDirtyChange}
        />
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
            {
              key: "wxId",
              label: "企业微信 ID",
              children: (
                <Space size={8} wrap>
                  {detail.wxId ?? "—"}
                  {detail.wxId && detail.allowedActions.unlinkWecom?.allowed && (
                    <Button size="small" danger onClick={() => onUnlinkWecom()}>
                      解除企业微信绑定
                    </Button>
                  )}
                </Space>
              ),
            },
            ...(externalBindings.length > 0 && detail.allowedActions.unlinkWecom?.allowed
              ? [
                  {
                    key: "externalWecomBindings",
                    label: "非本企业企微身份",
                    children: (
                      <Space orientation="vertical">
                        {externalBindings.map((binding) => (
                          <Space key={binding.id} wrap>
                            <Typography.Text>
                              {binding.maskedOpenId}（#{binding.id}）
                            </Typography.Text>
                            <Typography.Text type="secondary">
                              {new Date(binding.createTime).toLocaleString()}
                            </Typography.Text>
                            <Button
                              size="small"
                              danger
                              aria-label={`解除非本企业企微绑定 #${binding.id}`}
                              onClick={() => onUnlinkWecom(binding)}
                            >
                              解绑
                            </Button>
                          </Space>
                        ))}
                      </Space>
                    ),
                  },
                ]
              : []),
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
