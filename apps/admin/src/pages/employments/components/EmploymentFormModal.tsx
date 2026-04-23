import { apiClient } from '@/lib/api-client';
import { createEmployment } from '@/services/employment';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { AppRouter } from '@iam/api/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import { message } from 'antd';

type OrgVo =
  inferRouterOutputs<AppRouter>['admin']['organization']['search']['result'][number];
type PosVo =
  inferRouterOutputs<AppRouter>['admin']['position']['search']['result'][number];

type Props = {
  open: boolean;
  presetUsername?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function EmploymentFormModal({
  open,
  presetUsername,
  onOpenChange,
  onSuccess,
}: Props) {
  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '创建失败');

  return (
    <ModalForm
      title={presetUsername ? `为 ${presetUsername} 新增雇佣` : '新增雇佣'}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{
        username: presetUsername ?? undefined,
        isPrimary: false,
      }}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          await createEmployment({
            username: values.username,
            companyOrgCode: values.companyOrgCode,
            deptOrgCode: values.deptOrgCode,
            posCode: values.posCode,
            isPrimary: values.isPrimary,
            startTime: values.startTime
              ? new Date(values.startTime)
              : undefined,
            description: values.description || null,
          });
          message.success('雇佣已创建');
          onSuccess?.();
          return true;
        } catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      <ProFormText
        name="username"
        label="用户"
        disabled={!!presetUsername}
        rules={[{ required: true, message: '请输入用户名（工号）' }]}
        tooltip="如果从用户抽屉跳转，此处自动预填"
      />
      {/* exactConditions.orgType 为单值字符串，按 orgType 过滤公司类型 */}
      <ProFormSelect
        name="companyOrgCode"
        label="公司"
        showSearch
        rules={[{ required: true, message: '请选择公司' }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgType: '公司' },
            },
          });
          return res.result.map((o: OrgVo) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      {/* exactConditions.orgType 为单值字符串，按 orgType 过滤部门类型 */}
      <ProFormSelect
        name="deptOrgCode"
        label="部门"
        showSearch
        rules={[{ required: true, message: '请选择部门' }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgType: '部门' },
            },
          });
          return res.result.map((o: OrgVo) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="posCode"
        label="岗位"
        showSearch
        rules={[{ required: true, message: '请选择岗位' }]}
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
        name="isPrimary"
        label="设为主岗"
        tooltip="若选 true，将自动把该用户其它主岗置为非主"
      />
      <ProFormDatePicker
        name="startTime"
        label="生效时间"
        tooltip="不填则使用当前时间"
      />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
