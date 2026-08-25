import {
  createOrganization,
  type OrganizationDetailVo,
  updateOrganization,
} from '@admin/services/organization';
import { getAdminAuthorizationReasonText } from '@admin/services/authorization';
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { getOrganizationStatusOptions, OrganizationType } from '@iam/contracts';
import { Alert, message } from 'antd';

type Props = {
  open: boolean;
  mode: 'create-root' | 'create-child' | 'edit';
  initialValues?: OrganizationDetailVo | null;
  parentCode?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const orgTypeOptions = Object.values(OrganizationType).map((t) => ({
  label: t,
  value: t,
}));

const titleMap: Record<Props['mode'], string> = {
  'create-root': '新建根组织',
  'create-child': '新建下级组织',
  edit: '编辑组织',
};

export default function OrgFormModal({
  open,
  mode,
  initialValues,
  parentCode,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = mode === 'edit';
  const canChangeStatus = !isEdit
    || initialValues?.allowedActions.changeStatus.allowed !== false;
  const changeStatusReason = isEdit
    ? getAdminAuthorizationReasonText(
        initialValues?.allowedActions.changeStatus.reason ?? null,
      )
    : undefined;

  return (
    <ModalForm
      title={titleMap[mode]}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        isEdit && initialValues
          ? {
              orgCode: initialValues.orgCode,
              orgName: initialValues.orgName,
              orgType: initialValues.orgType,
              status: initialValues.status,
            }
          : {
              orgType: OrganizationType.Department,
              status: 1,
            }
      }
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      onFinish={async (values) => {
        try {
          if (isEdit && initialValues) {
            await updateOrganization(initialValues.orgCode, {
              orgName: values.orgName,
              orgType: values.orgType,
              ...(canChangeStatus ? { status: values.status } : {}),
            });
            message.success('更新成功');
          } else {
            await createOrganization({
              orgCode: values.orgCode,
              orgName: values.orgName,
              orgType: values.orgType,
              parentCode: mode === 'create-child' ? (parentCode ?? null) : null,
              status: values.status,
            });
            message.success('创建成功');
          }
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : '操作失败');
          return false;
        }
      }}
    >
      {isEdit && canChangeStatus && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="若改为暂停或停用，服务端会全量检查当前组织及全部下级组织的开放责任任命。"
        />
      )}
      <ProFormText
        name="orgCode"
        label="组织编码"
        disabled={isEdit}
        rules={[{ required: true, message: '请输入组织编码' }]}
      />
      <ProFormText
        name="orgName"
        label="组织名称"
        rules={[{ required: true, message: '请输入组织名称' }]}
      />
      <ProFormSelect
        name="orgType"
        label="组织类型"
        options={orgTypeOptions}
        rules={[{ required: true }]}
      />
      {mode === 'create-child' && (
        <ProFormText
          label="上级组织"
          initialValue={parentCode ?? ''}
          disabled
          fieldProps={{ value: parentCode ?? '' }}
        />
      )}
      <ProFormSelect
        name="status"
        label="状态"
        disabled={!canChangeStatus}
        tooltip={changeStatusReason}
        options={getOrganizationStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
