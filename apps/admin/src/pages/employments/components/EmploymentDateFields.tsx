import { ProFormText } from "@ant-design/pro-components";
import { EmploymentDateSchema } from "@iam/contracts";

const validateDate = (_: unknown, value: string | undefined) =>
  !value || EmploymentDateSchema.safeParse(value).success
    ? Promise.resolve()
    : Promise.reject(new Error("请输入有效日期"));

export default function EmploymentDateFields({ transfer = false }: { transfer?: boolean }) {
  return (
    <>
      {!transfer && (
        <ProFormText
          name="startTime"
          label="开始日"
          extra="北京时间，包含开始日。留空表示无开始限制。"
          fieldProps={{ type: "date" }}
          rules={[{ validator: validateDate }]}
        />
      )}
      <ProFormText
        name="endTime"
        label="截止日"
        extra={
          transfer
            ? "新任职今天开始，截止日须晚于今天（北京时间）。留空表示长期有效。"
            : "截止日当天不在有效期内。留空表示长期有效。"
        }
        fieldProps={{ type: "date" }}
        dependencies={transfer ? undefined : ["startTime"]}
        rules={[
          { validator: validateDate },
          ({ getFieldValue }) => ({
            validator: async (_, value: string | undefined) => {
              const startTime = getFieldValue("startTime");
              if (!transfer && value && typeof startTime === "string" && startTime >= value) {
                throw new Error("开始日必须早于截止日");
              }
            },
          }),
        ]}
      />
    </>
  );
}
