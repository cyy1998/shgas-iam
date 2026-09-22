import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { getAdminAuthorizationReasonText } from '@admin/services/authorization';
import {
  type EmploymentDetailVo,
  transferEmployment,
} from '@admin/services/employment';
import { searchPositions } from '@admin/services/position';
import type { ProFormInstance } from '@ant-design/pro-components';
import {
  ModalForm,
  ProForm,
  ProFormRadio,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { PositionStatus } from '@iam/contracts';
import { Alert, Descriptions, message } from 'antd';
import { useRef } from 'react';

type EmploymentTransferSource = Pick<
  EmploymentDetailVo,
  'id' | 'isPrimary' | 'organization' | 'position' | 'user' | 'allowedActions'
>;

type Props = {
  open: boolean;
  employment: EmploymentTransferSource | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newEmploymentId: number) => Promise<void> | void;
  onCommitted: (error: AdminMutationCommittedError) => Promise<void>;
};

function formatOrgPath(employment: EmploymentTransferSource) {
  return (
    employment.organization?.fullOrgPath
      ?.map((node) => node.orgName)
      .join(' / ') || employment.organization.assignedOrg.orgName
  );
}

function formatUser(employment: EmploymentTransferSource) {
  return `${employment.user.name} (${employment.user.username})`;
}

function formatPosition(employment: EmploymentTransferSource) {
  return `${employment.position.posName} (${employment.position.posCode})`;
}

export default function TransferModal({
  open,
  employment,
  onOpenChange,
  onSuccess,
  onCommitted,
}: Props) {
  const formRef = useRef<ProFormInstance>(undefined);

  const transferAllowed = employment?.allowedActions.transfer.allowed ?? false;

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
      submitter={{ submitButtonProps: { disabled: !transferAllowed } }}
      onFinish={async (values) => {
        if (!employment || !transferAllowed) return false;
        if (typeof values.isPrimary !== 'boolean') {
          message.warning('请选择新任职是否为主任职');
          return false;
        }
        try {
          const outcome = await transferEmployment(employment.id, {
            newOrgCode: values.newOrgCode,
            newPosCode: values.newPosCode,
            isPrimary: values.isPrimary,
            description: values.description || null,
          });
          if (outcome.changed) message.success('转岗成功');
          else message.info('无需修改');
          await onSuccess?.(outcome.result.id);
          return true;
        } catch (err) {
          if (err instanceof AdminMutationCommittedError) {
            await onCommitted(err);
            return true;
          }
          handleError(err);
          return false;
        }
      }}
    >
      {employment && !transferAllowed && (
        <Alert
          type="warning"
          showIcon
          message={getAdminAuthorizationReasonText(
            employment.allowedActions.transfer.reason,
          )}
        />
      )}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="转岗会结束原任职及其全部开放责任任命；新任职不会自动继承责任。"
      />
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
          const res = await searchPositions({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { statuses: [PositionStatus.Enable] },
            },
          });
          return res.result.map((p) => ({
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
