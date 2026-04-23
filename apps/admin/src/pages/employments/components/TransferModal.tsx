import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { apiClient } from "@/lib/api-client";
import { type EmploymentVo, transferEmployment } from "@/services/employment";
import {
  ModalForm,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { Descriptions, message } from "antd";

type OrgVo = inferRouterOutputs<AppRouter>["admin"]["organization"]["search"]["result"][number];
type PosVo = inferRouterOutputs<AppRouter>["admin"]["position"]["search"]["result"][number];

type Props = {
  open: boolean;
  employment: EmploymentVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function TransferModal({
  open,
  employment,
  onOpenChange,
  onSuccess,
}: Props) {
  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "转岗失败");

  return (
    <ModalForm
      title={`转岗 — ${employment?.name ?? ""} (${employment?.username ?? ""})`}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{ inheritPrimary: true }}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        if (!employment) return false;
        try {
          await transferEmployment(employment.id, {
            newCompanyOrgCode: values.newCompanyOrgCode,
            newDeptOrgCode: values.newDeptOrgCode,
            newPosCode: values.newPosCode,
            inheritPrimary: values.inheritPrimary,
            startTime: values.startTime ? new Date(values.startTime) : undefined,
            description: values.description || null,
          });
          message.success("转岗成功");
          onSuccess?.();
          return true;
        }
        catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      {employment && (
        <Descriptions
          size="small"
          bordered
          column={1}
          style={{ marginBottom: 16 }}
          items={[
            { label: "原公司", children: `${employment.compName} (${employment.compCode})` },
            { label: "原部门", children: `${employment.orgName} (${employment.orgCode})` },
            { label: "原岗位", children: `${employment.posName} (${employment.posCode})` },
            { label: "原主岗", children: employment.isPrimary ? "是" : "否" },
          ]}
        />
      )}
      <ProFormSelect
        name="newCompanyOrgCode"
        label="新公司"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgType: "公司" },
            },
          });
          return res.result.map((o: OrgVo) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="newDeptOrgCode"
        label="新部门"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgType: "部门" },
            },
          });
          return res.result.map((o: OrgVo) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="newPosCode"
        label="新岗位"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.position.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: {},
            },
          });
          return res.result.map((p: PosVo) => ({
            label: `${p.posName} (${p.posCode})`,
            value: p.posCode,
          }));
        }}
      />
      <ProFormSwitch
        name="inheritPrimary"
        label="继承主岗"
        tooltip="默认继承原雇佣的 isPrimary；关闭则新岗位默认非主"
      />
      <ProFormDatePicker name="startTime" label="新岗位生效时间" />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
