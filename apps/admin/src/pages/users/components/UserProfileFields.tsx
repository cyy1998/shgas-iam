import { ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { getUserTypeOptions } from "@iam/contracts";

export default function UserProfileFields() {
  return (
    <>
      <ProFormText
        name="name"
        label="姓名"
        rules={[
          { transform: (value: string) => value?.trim(), required: true, whitespace: true, message: "请输入姓名" },
          { transform: (value: string) => value?.trim(), max: 64, message: "姓名最多64个字符" },
        ]}
      />
      <ProFormSelect
        name="userType"
        label="用户类型"
        options={getUserTypeOptions()}
        rules={[{ required: true, message: "请选择用户类型" }]}
      />
      <ProFormText name="mobile" label="手机号" />
      <ProFormText name="wxId" label="微信 ID" />
    </>
  );
}
