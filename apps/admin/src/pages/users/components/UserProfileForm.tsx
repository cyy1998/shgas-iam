import styles from "@admin/components/detail/DetailDrawer.module.less";
import type { UserDetailVo, updateUser } from "@admin/services/user";
import { ProForm } from "@ant-design/pro-components";
import { Button, ConfigProvider, Form, message, Space } from "antd";
import { useRef } from "react";
import UserProfileFields from "./UserProfileFields";

type Props = {
  detail: UserDetailVo;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: Parameters<typeof updateUser>[1]) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
};

type ProfileValues = Pick<UserDetailVo, "name" | "mobile" | "wxId" | "userType">;

export default function UserProfileForm({ detail, saving, onCancel, onSave, onDirtyChange }: Props) {
  const [form] = Form.useForm<ProfileValues>();
  const initialValues = useRef<ProfileValues>({
    name: detail.name,
    mobile: detail.mobile ?? "",
    wxId: detail.wxId ?? "",
    userType: detail.userType,
  });

  return (
    <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 20, labelFontSize: 13 } } }}>
      <ProForm<ProfileValues>
        name="user-profile"
        form={form}
        layout="vertical"
        size="middle"
        grid
        colProps={{ xs: 24, sm: 12 }}
        rowProps={{ gutter: 24 }}
        disabled={saving}
        initialValues={initialValues.current}
        onValuesChange={(_, values) => {
          onDirtyChange(
            (Object.keys(initialValues.current) as (keyof ProfileValues)[]).some(
              (key) => (values[key] ?? "") !== (initialValues.current[key] ?? ""),
            ),
          );
        }}
        onFinish={async (values) => {
          const data: Parameters<typeof updateUser>[1] = {};
          if (form.isFieldTouched("name")) data.name = values.name.trim();
          if (form.isFieldTouched("mobile")) data.mobile = values.mobile || null;
          if (form.isFieldTouched("wxId")) data.wxId = values.wxId || null;
          if (form.isFieldTouched("userType")) data.userType = values.userType;
          if (Object.keys(data).length === 0) {
            message.info("请先编辑需要保存的字段");
            return false;
          }
          return onSave(data);
        }}
        submitter={{
          render: () => (
            <Space size={8} className={styles["form-actions"]}>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存
              </Button>
              <Button onClick={onCancel} disabled={saving}>
                取消
              </Button>
            </Space>
          ),
        }}
      >
        <UserProfileFields />
      </ProForm>
    </ConfigProvider>
  );
}
