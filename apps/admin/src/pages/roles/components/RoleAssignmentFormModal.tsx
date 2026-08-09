import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import {
  normalizeAssignmentCreateInput,
  requestEmploymentOptions,
  requestPositionOptions,
  roleAssignmentTargetTypeOptions,
} from '@admin/pages/roles/role-selectors';
import { createRoleAssignment } from '@admin/services/role';
import {
  ModalForm,
  ProForm,
  ProFormDependency,
  ProFormSelect,
  ProFormSwitch,
  type ProFormInstance,
} from '@ant-design/pro-components';
import { RoleAssignmentTargetType } from '@iam/contracts';
import { message } from 'antd';
import { useRef } from 'react';

type Props = {
  open: boolean;
  roleCode: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError?: (err: unknown) => void;
};

export default function RoleAssignmentFormModal({
  open,
  roleCode,
  onOpenChange,
  onSuccess,
  onError,
}: Props) {
  const formRef = useRef<ProFormInstance>(undefined);
  const [messageApi, messageContextHolder] = message.useMessage();
  const handleError =
    onError ??
    ((err: unknown) =>
      messageApi.error(err instanceof Error ? err.message : '操作失败'));

  return (
    <ModalForm
      title="新增角色分配"
      open={open}
      formRef={formRef}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '确定',
      }}
      initialValues={{
        targetType: RoleAssignmentTargetType.Organization,
        includeDescendants: true,
      }}
      onOpenChange={onOpenChange}
      onFinish={async (values) => {
        if (!roleCode) return false;
        try {
          await createRoleAssignment(
            roleCode,
            normalizeAssignmentCreateInput(values),
          );
          messageApi.success('分配已创建');
          onOpenChange(false);
          onSuccess();
          return true;
        } catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      {messageContextHolder}
      <ProFormSelect
        name="targetType"
        label="分配类型"
        options={roleAssignmentTargetTypeOptions}
        rules={[{ required: true }]}
        fieldProps={{
          onChange: (targetType) => {
            formRef.current?.setFieldsValue({
              orgCode: undefined,
              posCode: undefined,
              employmentId: undefined,
              includeDescendants:
                targetType === RoleAssignmentTargetType.Organization
                  ? true
                  : undefined,
            });
          },
        }}
      />
      <ProFormDependency name={['targetType']}>
        {({ targetType }) => {
          if (targetType === RoleAssignmentTargetType.Position) {
            return (
              <ProFormSelect
                name="posCode"
                label="岗位"
                showSearch
                rules={[{ required: true, message: '请选择岗位' }]}
                fieldProps={{
                  filterOption: false,
                  placeholder: '输入岗位名称或编码搜索',
                  showSearch: true,
                }}
                request={requestPositionOptions}
              />
            );
          }
          if (targetType === RoleAssignmentTargetType.Employment) {
            return (
              <ProFormSelect
                name="employmentId"
                label="任职"
                showSearch
                rules={[{ required: true, message: '请选择任职' }]}
                fieldProps={{
                  filterOption: false,
                  placeholder: '输入任职 ID、用户、组织或岗位搜索',
                  showSearch: true,
                }}
                request={requestEmploymentOptions}
              />
            );
          }
          return (
            <>
              <ProForm.Item
                name="orgCode"
                label="组织"
                rules={[{ required: true, message: '请选择组织' }]}
              >
                <OrganizationTreeSelector placeholder="请选择组织" />
              </ProForm.Item>
              <ProFormSwitch name="includeDescendants" label="包含下级组织" />
            </>
          );
        }}
      </ProFormDependency>
    </ModalForm>
  );
}
