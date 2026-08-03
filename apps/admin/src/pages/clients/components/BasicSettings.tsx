import {
  deleteClient,
  updateClient,
  updateClientStatus,
  type ClientDetailVo,
} from '@admin/services/client';
import { ClientStatus, getClientStatusOptions } from '@iam/contracts';
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { confirmClientSettingAction } from './settingsHelpers';

type Props = {
  client: ClientDetailVo;
  onDirtyChange: (dirty: boolean) => void;
  onMutated: () => Promise<void>;
  onDeleted: () => void;
};

type BasicFormValues = {
  clientName: string;
  clientSecret: string;
  url?: string;
  description?: string;
};

export default function BasicSettings({
  client,
  onDirtyChange,
  onMutated,
  onDeleted,
}: Props) {
  const [form] = Form.useForm<BasicFormValues>();
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const status = pendingStatus ?? client.status;
  const statusDirty = pendingStatus !== null && pendingStatus !== client.status;

  useEffect(() => {
    form.setFieldsValue({
      clientName: client.clientName,
      clientSecret: client.clientSecret,
      url: client.url ?? undefined,
      description: client.description ?? undefined,
    });
  }, [client, form]);

  useEffect(() => {
    onDirtyChange(formDirty || statusDirty);
  }, [formDirty, onDirtyChange, statusDirty]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card title="基础信息">
        <Form<BasicFormValues>
          form={form}
          layout="vertical"
          onValuesChange={() => setFormDirty(true)}
          onFinish={async (values) => {
            setSaving(true);
            try {
              await updateClient(client.clientCode, {
                clientName: values.clientName,
                clientSecret: values.clientSecret,
                url: values.url || null,
                description: values.description || null,
                extAttributes: {},
              });
              setFormDirty(false);
              message.success('基础信息已保存');
              await onMutated();
            } catch (err) {
              handleError(err);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item
            name="clientName"
            label="应用名称"
            rules={[{ required: true, message: '请输入应用名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="clientSecret"
            label="通用应用密钥"
            extra="不用于 Custom SSO 或 OIDC。"
            rules={[{ required: true, message: '请输入应用密钥' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="url" label="访问地址">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存基础信息
          </Button>
        </Form>
      </Card>

      <Card title="全局状态">
        <Space wrap>
          <Select
            aria-label="全局状态"
            value={status}
            style={{ width: 180 }}
            options={getClientStatusOptions().map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            onChange={setPendingStatus}
          />
          <Button
            disabled={formDirty || status === client.status}
            onClick={async () => {
              const disabling = status !== ClientStatus.Enable;
              if (
                !(await confirmClientSettingAction(
                  '更新应用全局状态？',
                  disabling
                    ? '协议配置与启用意图会保留，但已有协议对象将被撤销。'
                    : '重新启用应用后，各协议会恢复原有启用意图。',
                ))
              ) {
                return;
              }
              try {
                await updateClientStatus(client.clientCode, status);
                setPendingStatus(null);
                message.success('全局状态已更新');
                await onMutated();
              } catch (err) {
                handleError(err);
              }
            }}
          >
            更新全局状态
          </Button>
        </Space>
      </Card>

      <Card title="删除应用">
        <Space orientation="vertical">
          <Typography.Text type="secondary">
            删除是软删除，会撤销协议对象，但不要求先分别移除协议配置。
          </Typography.Text>
          <Button
            danger
            onClick={async () => {
              if (
                !(await confirmClientSettingAction(
                  `删除应用 ${client.clientName}？`,
                  '删除后将返回应用列表，该操作不会物理删除历史记录。',
                ))
              ) {
                return;
              }
              try {
                await deleteClient(client.clientCode);
                message.success('已删除');
                onDeleted();
              } catch (err) {
                handleError(err);
              }
            }}
          >
            删除应用
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
