import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { createEmployment } from '@admin/services/employment';
import { searchPositions } from '@admin/services/position';
import { searchUsers } from '@admin/services/user';
import type { ProFormInstance } from '@ant-design/pro-components';
import {
  ModalForm,
  ProForm,
  ProFormSelect,
  ProFormSwitch,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { PositionStatus, UserStatus } from '@iam/contracts';
import { Alert, message } from 'antd';
import { useRef } from 'react';

type Props = {
  open: boolean;
  presetUsername?: string | null;
  presetName?: string | null;
  presetUserStatus?: UserStatus;
  presetOrgCode?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onCommitted: (error: AdminMutationCommittedError) => Promise<void> | void;
};

export default function EmploymentFormModal({
  open,
  presetUsername,
  presetName,
  presetUserStatus,
  presetOrgCode,
  onOpenChange,
  onSuccess,
  onCommitted,
}: Props) {
  const formRef = useRef<ProFormInstance>(undefined);

  const userDisabled = presetUserStatus === UserStatus.Disable;

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
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      submitter={{ submitButtonProps: { disabled: userDisabled } }}
      onFinish={async (values) => {
        if (userDisabled) return false;
        try {
          const outcome = await createEmployment({
            username: values.username,
            orgCode: values.orgCode,
            posCode: values.posCode,
            isPrimary: values.isPrimary,
            description: values.description || null,
          });
          if (outcome.changed) message.success('雇佣已创建');
          else message.info('无需修改');
          onSuccess?.();
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
      {userDisabled && (
        <Alert
          type="warning"
          showIcon
          message="用户已停用，请由有权限的管理员恢复账号后再新增任职。"
        />
      )}
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
          const res = await searchUsers({
            pageNum: 1,
            pageSize: 20,
            conditions: {
              fuzzyConditions: { text },
              exactConditions: {},
            },
          });
          return res.result.map((u) => ({
            label: `${u.name} (${u.username})${u.status === UserStatus.Disable ? ' — 已停用' : ''}`,
            disabled: u.status === UserStatus.Disable,
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
      <ProFormSelect
        name="posCode"
        label="岗位"
        showSearch
        rules={[{ required: true, message: '请选择岗位' }]}
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
      <ProFormSwitch
        name="isPrimary"
        label="设为主岗"
        tooltip="若选 true，将自动把该用户其它主岗置为非主"
      />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
