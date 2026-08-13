import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import { apiClient } from '@admin/lib/api-client';
import {
  type EmploymentVo,
  transferEmployment,
} from '@admin/services/employment';
import type { ProFormInstance } from '@ant-design/pro-components';
import {
  ModalForm,
  ProForm,
  ProFormRadio,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { AppRouter } from '@iam/admin-api/trpc';
import { PositionStatus } from '@iam/contracts';
import type { inferRouterOutputs } from '@trpc/server';
import { Descriptions, message } from 'antd';
import { useRef } from 'react';

type PosVo =
  inferRouterOutputs<AppRouter>['admin']['position']['search']['result'][number];

type Props = {
  open: boolean;
  employment: EmploymentVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

function formatOrgPath(employment: EmploymentVo) {
  return (
    employment.organization?.fullOrgPath
      ?.map((node) => node.orgName)
      .join(' / ') || employment.organization.assignedOrg.orgName
  );
}

function formatUser(employment: EmploymentVo) {
  return `${employment.user.name} (${employment.user.username})`;
}

function formatPosition(employment: EmploymentVo) {
  return `${employment.position.posName} (${employment.position.posCode})`;
}

export default function TransferModal({
  open,
  employment,
  onOpenChange,
  onSuccess,
}: Props) {
  const formRef = useRef<ProFormInstance>(undefined);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '转岗失败');

  return (
    <ModalForm
      title={employment ? `转岗 — ${formatUser(employment)}` : '转岗'}
      open={open}
      onOpenChange={onOpenChange}
      formRef={formRef}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      onFinish={async (values) => {
        if (!employment) return false;
        if (typeof values.isPrimary !== 'boolean') {
          message.warning('请选择新任职是否为主任职');
          return false;
        }
        try {
          await transferEmployment(employment.id, {
            newOrgCode: values.newOrgCode,
            newPosCode: values.newPosCode,
            isPrimary: values.isPrimary,
            description: values.description || null,
          });
          message.success('转岗成功');
          onSuccess?.();
          return true;
        } catch (err) {
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
            {
              label: '原组织路径',
              children: formatOrgPath(employment),
            },
            {
              label: '原岗位',
              children: formatPosition(employment),
            },
            { label: '原主岗', children: employment.isPrimary ? '是' : '否' },
          ]}
        />
      )}
      <ProForm.Item
        name="newOrgCode"
        label="新任职组织"
        rules={[{ required: true, message: '请选择新任职组织' }]}
      >
        <OrganizationTreeSelector placeholder="请选择新的实际任职组织" />
      </ProForm.Item>
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
              exactConditions: { statuses: [PositionStatus.Enable] },
            },
          });
          return res.result.map((p: PosVo) => ({
            label: `${p.posName} (${p.posCode})`,
            value: p.posCode,
          }));
        }}
      />
      <ProFormRadio.Group
        name="isPrimary"
        label="新任职主任职"
        rules={[{ required: true, message: '请选择新任职是否为主任职' }]}
        options={[
          { label: '主任职', value: true },
          { label: '非主任职', value: false },
        ]}
      />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
