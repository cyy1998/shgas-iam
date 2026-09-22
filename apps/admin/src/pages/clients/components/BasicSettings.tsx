import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
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
import type { ClientCommittedFailureKind } from './settingsHelpers';
import { confirmClientSettingAction } from './settingsHelpers';

type Props = {
  client: ClientDetailVo;
  onDirtyChange: (dirty: boolean) => void;
  onCommitted: (kind?: ClientCommittedFailureKind) => Promise<void>;
  onMutated: () => Promise<void>;
  onDeleted: () => void;
};

type BasicFormValues = {
  clientName: string;
  url?: string;
  description?: string;
};

export default function BasicSettings({
  client,
  onDirtyChange,
  onMutated,
  onCommitted,
  onDeleted,
}: Props) {
  const [form] = Form.useForm<BasicFormValues>();
  const [secretForm] = Form.useForm<{ clientSecret: string }>();
  const [secretDirty, setSecretDirty] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const status = pendingStatus ?? client.status;
  const statusDirty = pendingStatus !== null && pendingStatus !== client.status;

  useEffect(() => {
    if (!formDirty)
      form.setFieldsValue({
        clientName: client.clientName,
        url: client.url ?? undefined,
        description: client.description ?? undefined,
      });
    if (!secretDirty)
      secretForm.setFieldsValue({ clientSecret: client.clientSecret });
  }, [client, form, secretForm, formDirty, secretDirty]);

  useEffect(() => {
    onDirtyChange(formDirty || secretDirty || statusDirty);
  }, [formDirty, secretDirty, onDirtyChange, statusDirty]);

  const handleError = async (
    err: unknown,
    section: 'profile' | 'secret' | 'status' | 'delete',
    kind: ClientCommittedFailureKind = 'mutation',
  ) => {
    if (err instanceof AdminMutationCommittedError) {
      if (section === 'profile') setFormDirty(false);
      if (section === 'secret') setSecretDirty(false);
      if (section === 'status') setPendingStatus(null);
      await onCommitted(kind);
      return;
    }
    message.error(err instanceof Error ? err.message : '操作失败');
  };

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
              const outcome = await updateClient(client.clientCode, {
                clientName: values.clientName,
                url: values.url || null,
                description: values.description || null,
                extAttributes: {},
              });
              setFormDirty(false);
              if (outcome.changed) message.success('基础信息已保存');
              else message.info('无需修改');
              await onMutated();
            } catch (err) {
              await handleError(err, 'profile');
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

      <Card title="内部 API 凭据">
        <Form
          form={secretForm}
          layout="vertical"
          onValuesChange={() => setSecretDirty(true)}
          onFinish={async ({ clientSecret }) => {
            setSaving(true);
            try {
              const outcome = await updateClient(client.clientCode, {
                clientSecret,
              });
              setSecretDirty(false);
              if (outcome.changed) message.success('内部 API 凭据已保存');
              else message.info('无需修改');
              await onMutated();
            } catch (error) {
              await handleError(error, 'secret');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item
            name="clientSecret"
            label="通用应用密钥"
            extra="用于内部 API 访问，独立保存。"
            rules={[{ required: true, message: '请输入应用密钥' }]}
          >
            <Input.Password />
          </Form.Item>
          <Button htmlType="submit" loading={saving} disabled={formDirty}>
            保存内部 API 凭据
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
            disabled={formDirty || secretDirty || status === client.status}
            onClick={async () => {
              if (
                status === ClientStatus.Disable &&
                !(await confirmClientSettingAction(
                  '更新应用全局状态？',
                  '协议配置与启用意图会保留，已有会话不会因此终止。',
                ))
              ) {
                return;
              }
              try {
                const outcome = await updateClientStatus(
                  client.clientCode,
                  status,
                );
                setPendingStatus(null);
                if (outcome.changed) message.success('全局状态已更新');
                else message.info('无需修改');
                await onMutated();
              } catch (err) {
                await handleError(err, 'status');
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
            请先处理角色分配并删除此应用下的全部角色，暂停或停用的角色也会阻止删除。
            删除应用是软删除，会终止此应用的会话，但不要求先移除协议配置。
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
                await handleError(err, 'delete');
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
