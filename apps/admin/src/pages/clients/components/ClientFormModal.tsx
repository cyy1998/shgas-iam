import {
  createClient,
  type ClientDetailVo,
  updateClient,
} from '@admin/services/client';
import {
  ModalForm,
  ProFormGroup,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import {
  ClientManagementLevel,
  ClientStatus,
  getClientManagementLevelOptions,
  getClientStatusOptions,
} from '@iam/contracts';
import { message } from 'antd';

type Props = {
  open: boolean;
  initialValues?: ClientDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type FormValues = {
  clientCode: string;
  clientName: string;
  clientSecret: string;
  url?: string;
  status: ClientStatus;
  description?: string;
  managementLevel: ClientManagementLevel;
  requireOrcas?: boolean;
  validRedirectUrlsText?: string;
  userExcludingText?: string;
  logoutEndpoint: string;
  callbackEndpoint: string;
};

const defaultEndpoint = 'http://localhost:8888';

function splitLines(value: string | undefined) {
  return (value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value: string[] | undefined) {
  return (value ?? []).join('\n');
}

function toInitialValues(initialValues: ClientDetailVo | null | undefined) {
  if (!initialValues) {
    return {
      status: ClientStatus.Enable,
      managementLevel: ClientManagementLevel.None,
      requireOrcas: false,
      logoutEndpoint: defaultEndpoint,
      callbackEndpoint: defaultEndpoint,
    };
  }
  return {
    clientCode: initialValues.clientCode,
    clientName: initialValues.clientName,
    clientSecret: initialValues.clientSecret,
    url: initialValues.url ?? undefined,
    status: initialValues.status,
    description: initialValues.description ?? undefined,
    managementLevel: initialValues.extAttributes.managementLevel,
    requireOrcas: initialValues.extAttributes.requireOrcas,
    validRedirectUrlsText: joinLines(
      initialValues.extAttributes.validRedirectUrls,
    ),
    userExcludingText: joinLines(initialValues.extAttributes.userExcluding),
    logoutEndpoint: initialValues.extAttributes.logoutEndpoint,
    callbackEndpoint: initialValues.extAttributes.callbackEndpoint,
  };
}

export default function ClientFormModal({
  open,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;

  return (
    <ModalForm<FormValues>
      title={isEdit ? '编辑应用' : '新建应用'}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={toInitialValues(initialValues)}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        const body = {
          clientName: values.clientName,
          clientSecret: values.clientSecret,
          url: values.url || null,
          status: values.status,
          description: values.description || null,
          extAttributes: {
            userExcluding: splitLines(values.userExcludingText),
            requireOrcas: values.requireOrcas ?? false,
            validRedirectUrls: splitLines(values.validRedirectUrlsText),
            managementLevel: values.managementLevel,
            logoutEndpoint: values.logoutEndpoint,
            callbackEndpoint: values.callbackEndpoint,
          },
        };

        try {
          if (isEdit) {
            await updateClient(initialValues!.clientCode, body);
            message.success('更新成功');
          } else {
            await createClient({
              ...body,
              clientCode: values.clientCode,
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
      <ProFormGroup>
        <ProFormText
          name="clientCode"
          label="应用编码"
          disabled={isEdit}
          width="md"
          rules={[{ required: true, message: '请输入应用编码' }]}
        />
        <ProFormText
          name="clientName"
          label="应用名称"
          width="md"
          rules={[{ required: true, message: '请输入应用名称' }]}
        />
      </ProFormGroup>
      <ProFormGroup>
        <ProFormText
          name="clientSecret"
          label="应用密钥"
          width="md"
          fieldProps={{ type: 'password' }}
          rules={[{ required: true, message: '请输入应用密钥' }]}
        />
        <ProFormText name="url" label="访问地址" width="md" />
      </ProFormGroup>
      <ProFormGroup>
        <ProFormSelect
          name="status"
          label="状态"
          width="md"
          options={getClientStatusOptions().map((o) => ({
            label: o.label,
            value: o.value,
          }))}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="managementLevel"
          label="管理模式"
          width="md"
          options={getClientManagementLevelOptions()}
          rules={[{ required: true }]}
        />
      </ProFormGroup>
      <ProFormSwitch name="requireOrcas" label="需要 ORCAS" />
      <ProFormTextArea
        name="validRedirectUrlsText"
        label="允许重定向地址"
        fieldProps={{ rows: 3 }}
      />
      <ProFormTextArea
        name="userExcludingText"
        label="维护白名单用户"
        fieldProps={{ rows: 3 }}
      />
      <ProFormGroup>
        <ProFormText
          name="logoutEndpoint"
          label="登出地址"
          width="md"
          rules={[{ required: true, message: '请输入登出地址' }]}
        />
        <ProFormText
          name="callbackEndpoint"
          label="回调地址"
          width="md"
          rules={[{ required: true, message: '请输入回调地址' }]}
        />
      </ProFormGroup>
      <ProFormTextArea name="description" label="描述" />
    </ModalForm>
  );
}
