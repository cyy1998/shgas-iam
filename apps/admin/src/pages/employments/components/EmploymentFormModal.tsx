import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import { apiClient } from '@admin/lib/api-client';
import { createEmployment } from '@admin/services/employment';
import {
  ModalForm,
  ProFormDatePicker,
  ProForm,
  ProFormSelect,
  ProFormSwitch,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import { message } from 'antd';
import { useRef } from 'react';

type PosVo =
  inferRouterOutputs<AppRouter>['admin']['position']['search']['result'][number];
type UserVo =
  inferRouterOutputs<AppRouter>['admin']['user']['search']['result'][number];

type Props = {
  open: boolean;
  presetUsername?: string | null;
  presetName?: string | null;
  presetOrgCode?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function EmploymentFormModal({
  open,
  presetUsername,
  presetName,
  presetOrgCode,
  onOpenChange,
  onSuccess,
}: Props) {
  const formRef = useRef<ProFormInstance>();

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '创建失败');

  return (
    <ModalForm
      title={
        presetUsername
          ? `为 ${presetName ? `${presetName} (${presetUsername})` : presetUsername} 新增雇佣`
          : '新增雇佣'
      }
      open={open}
      onOpenChange={onOpenChange}
      formRef={formRef}
      initialValues={{
        username: presetUsername ?? undefined,
        orgCode: presetOrgCode ?? undefined,
        isPrimary: false,
      }}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          await createEmployment({
            username: values.username,
            orgCode: values.orgCode,
            expectedAncestorOrgCode: values.expectedAncestorOrgCode,
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
      <ProFormSelect
        name="username"
        label="用户"
        showSearch
        disabled={!!presetUsername}
        rules={[{ required: true, message: '请选择用户' }]}
        tooltip="输入工号或姓名模糊搜索；从用户抽屉跳转时会自动预填"
        fieldProps={{
          filterOption: false,
          placeholder: presetUsername ? undefined : '输入工号或姓名搜索',
          showSearch: true,
        }}
        request={async (params) => {
          if (presetUsername) {
            const label = presetName
              ? `${presetName} (${presetUsername})`
              : presetUsername;
            return [{ label, value: presetUsername }];
          }
          const text = (params.keyWords as string | undefined) || undefined;
          if (!text) return [];
          const res = await apiClient.admin.user.search.query({
            pageNum: 1,
            pageSize: 20,
            conditions: {
              fuzzyConditions: { text },
              exactConditions: {},
            },
          });
          return res.result.map((u: UserVo) => ({
            label: `${u.name} (${u.username})`,
            value: u.username,
          }));
        }}
      />
      <ProForm.Item
        name="orgCode"
        label="任职组织"
        rules={[{ required: true, message: '请选择任职组织' }]}
      >
        <OrganizationTreeSelector placeholder="请选择实际任职组织" />
      </ProForm.Item>
      <ProForm.Item name="expectedAncestorOrgCode" label="期望上级组织">
        <OrganizationTreeSelector placeholder="可选，用于校验组织范围" />
      </ProForm.Item>
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
