import { requestEmploymentOptionsWithoutId } from '@admin/components/employment-select-options';
import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import { createOrganizationResponsibilityAssignment } from '@admin/services/organization-responsibility';
import { ModalForm, ProForm, ProFormSelect } from '@ant-design/pro-components';
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from '@iam/contracts';
import { Alert, message } from 'antd';

type Props = {
  open: boolean;
  orgCode?: string;
  onOpenChange: (open: boolean) => void;
  onFailure: () => void | Promise<void>;
  onSuccess: (id: number) => void;
};

type FormValues = {
  targetOrganizationCode?: string;
  typeCode: OrganizationResponsibilityTypeCode;
  employmentId: number;
};

export default function OrganizationResponsibilityAssignmentFormModal({
  open,
  orgCode,
  onOpenChange,
  onFailure,
  onSuccess,
}: Props) {
  const [messageApi, messageContextHolder] = message.useMessage();

  return (
    <ModalForm<FormValues>
      title="新建责任任命"
      open={open}
      name="organization-responsibility-assignment-create"
      initialValues={{ typeCode: OrganizationResponsibilityTypeCode.Head }}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      onOpenChange={onOpenChange}
      onFinish={async (values) => {
        try {
          const targetOrganizationCode =
            orgCode ?? values.targetOrganizationCode;
          if (!targetOrganizationCode) return false;
          const created = await createOrganizationResponsibilityAssignment({
            orgCode: targetOrganizationCode,
            typeCode: values.typeCode,
            employmentId: values.employmentId,
          });
          messageApi.success('责任任命已创建');
          onOpenChange(false);
          onSuccess(created.result.id);
          return true;
        } catch (error) {
          messageApi.error(
            error instanceof Error ? error.message : '创建责任任命失败',
          );
          await onFailure();
          return false;
        }
      }}
    >
      {messageContextHolder}
      {orgCode ? (
        <Alert
          type="info"
          showIcon
          title={`目标组织：${orgCode}`}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <ProForm.Item
          name="targetOrganizationCode"
          label="目标组织"
          rules={[{ required: true, message: '请选择目标组织' }]}
        >
          <OrganizationTreeSelector
            visibleStatuses={[OrganizationStatus.Enable]}
            selectableStatuses={[OrganizationStatus.Enable]}
            placeholder="请选择目标组织"
          />
        </ProForm.Item>
      )}
      <ProFormSelect
        name="typeCode"
        label="责任类型"
        rules={[{ required: true, message: '请选择责任类型' }]}
        options={ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => ({
          label: type.name,
          value: type.code,
        }))}
      />
      <ProFormSelect
        name="employmentId"
        label="任职"
        showSearch
        rules={[{ required: true, message: '请选择任职' }]}
        fieldProps={{
          filterOption: false,
          placeholder: '搜索用户、账号、组织或岗位',
          showSearch: true,
        }}
        request={requestEmploymentOptionsWithoutId}
      />
    </ModalForm>
  );
}
