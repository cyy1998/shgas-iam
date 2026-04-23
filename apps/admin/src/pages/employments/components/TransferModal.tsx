import { apiClient } from '@/lib/api-client';
import { type EmploymentVo, transferEmployment } from '@/services/employment';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormDependency,
  ProFormSelect,
  ProFormSwitch,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import type { AppRouter } from '@iam/api/trpc';
import { OrganizationType } from '@iam/shared';
import type { inferRouterOutputs } from '@trpc/server';
import { Descriptions, message } from 'antd';
import { useRef } from 'react';

type OrgVo =
  inferRouterOutputs<AppRouter>['admin']['organization']['search']['result'][number];
type PosVo =
  inferRouterOutputs<AppRouter>['admin']['position']['search']['result'][number];

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
  const formRef = useRef<ProFormInstance>();

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '转岗失败');

  return (
    <ModalForm
      title={`转岗 — ${employment?.name ?? ''} (${employment?.username ?? ''})`}
      open={open}
      onOpenChange={onOpenChange}
      formRef={formRef}
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
            startTime: values.startTime
              ? new Date(values.startTime)
              : undefined,
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
              label: '原公司',
              children: `${employment.compName} (${employment.compCode})`,
            },
            {
              label: '原部门',
              children: `${employment.orgName} (${employment.orgCode})`,
            },
            {
              label: '原岗位',
              children: `${employment.posName} (${employment.posCode})`,
            },
            { label: '原主岗', children: employment.isPrimary ? '是' : '否' },
          ]}
        />
      )}
      <ProFormSelect
        name="newCompanyOrgCode"
        label="新公司"
        showSearch
        rules={[{ required: true }]}
        fieldProps={{
          onChange: () =>
            formRef.current?.setFieldValue('newDeptOrgCode', undefined),
        }}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgType: OrganizationType.Company },
            },
          });
          return res.result.map((o: OrgVo) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormDependency name={['newCompanyOrgCode']}>
        {({ newCompanyOrgCode }: { newCompanyOrgCode?: string }) => (
          <ProFormSelect
            name="newDeptOrgCode"
            label="新部门"
            showSearch
            disabled={!newCompanyOrgCode}
            placeholder={newCompanyOrgCode ? '请选择部门' : '请先选择新公司'}
            rules={[{ required: true }]}
            params={{ newCompanyOrgCode }}
            request={async (params) => {
              if (!newCompanyOrgCode) return [];
              const res = await apiClient.admin.organization.search.query({
                pageNum: 1,
                pageSize: 200,
                conditions: {
                  fuzzyConditions: {
                    text: (params.keyWords as string | undefined) || undefined,
                  },
                  exactConditions: {
                    orgType: OrganizationType.Department,
                    parentOrgCode: newCompanyOrgCode,
                  },
                },
              });
              return res.result.map((o: OrgVo) => ({
                label: `${o.orgName} (${o.orgCode})`,
                value: o.orgCode,
              }));
            }}
          />
        )}
      </ProFormDependency>
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
