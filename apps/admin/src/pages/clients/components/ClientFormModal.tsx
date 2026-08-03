import { createClient, type ClientDetailVo } from '@admin/services/client';
import {
  ModalForm,
  ProFormGroup,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { ClientStatus, getClientStatusOptions } from '@iam/contracts';
import { message } from 'antd';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (client: ClientDetailVo) => void;
};

type FormValues = {
  clientCode: string;
  clientName: string;
  clientSecret: string;
  url?: string;
  status: ClientStatus;
  description?: string;
};

export default function ClientFormModal({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  return (
    <ModalForm<FormValues>
      title="新建应用"
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{ status: ClientStatus.Enable }}
      modalProps={{
        destroyOnHidden: true,
        mask: { closable: false },
        okText: '创建并编辑',
      }}
      onFinish={async (values) => {
        try {
          const client = await createClient({
            clientCode: values.clientCode,
            clientName: values.clientName,
            clientSecret: values.clientSecret,
            url: values.url || null,
            status: values.status,
            description: values.description || null,
            extAttributes: {},
          });
          message.success('创建成功');
          onSuccess?.(client);
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
          tooltip="创建后不可修改，也是各协议使用的 client 标识"
          width="md"
          fieldProps={{ 'aria-label': '应用编码' }}
          rules={[{ required: true, message: '请输入应用编码' }]}
        />
        <ProFormText
          name="clientName"
          label="应用名称"
          width="md"
          fieldProps={{ 'aria-label': '应用名称' }}
          rules={[{ required: true, message: '请输入应用名称' }]}
        />
      </ProFormGroup>
      <ProFormGroup>
        <ProFormText
          name="clientSecret"
          label="通用应用密钥"
          tooltip="不用于 Custom SSO 或 OIDC"
          width="md"
          fieldProps={{
            type: 'password',
            'aria-label': '通用应用密钥',
          }}
          rules={[{ required: true, message: '请输入应用密钥' }]}
        />
        <ProFormText name="url" label="访问地址" width="md" />
      </ProFormGroup>
      <ProFormSelect
        name="status"
        label="全局状态"
        width="md"
        options={getClientStatusOptions().map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        rules={[{ required: true }]}
      />
      <ProFormTextArea name="description" label="描述" />
    </ModalForm>
  );
}
