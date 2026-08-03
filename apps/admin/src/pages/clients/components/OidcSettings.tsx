import {
  configureClientOidc,
  disableClientOidc,
  enableClientOidc,
  removeClientOidc,
  rotateClientOidcSecret,
  type ClientDetailVo,
  type ClientOidcConfigureInput,
} from '@admin/services/client';
import {
  ClientStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from '@iam/contracts';
import {
  Alert,
  Button,
  Card,
  Form,
  message,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import OneTimeSecretModal from './OneTimeSecretModal';
import {
  confirmClientSettingAction,
  normalizeClientSettingList,
} from './settingsHelpers';

type Props = {
  client: ClientDetailVo;
  onDirtyChange: (dirty: boolean) => void;
  onMutated: () => Promise<void>;
  onOneTimeSecretPendingChange: (pending: boolean) => void;
};

type OidcFormValues = {
  clientType: OidcClientType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: OidcScope[];
};

const scopeOptions = [
  { label: 'openid', value: OidcScope.OpenId },
  { label: 'profile', value: OidcScope.Profile },
  { label: 'phone', value: OidcScope.Phone },
  { label: 'iam:employments', value: OidcScope.IamEmployments },
  {
    label: 'iam:authorization（敏感）',
    value: OidcScope.IamAuthorization,
  },
];

function initialValues(client: ClientDetailVo): OidcFormValues {
  return {
    clientType: client.oidcConfig?.clientType ?? OidcClientType.Public,
    redirectUris: client.oidcConfig?.redirectUris ?? [],
    postLogoutRedirectUris: client.oidcConfig?.postLogoutRedirectUris ?? [],
    allowedScopes: client.oidcConfig?.allowedScopes ?? [OidcScope.OpenId],
  };
}

export default function OidcSettings({
  client,
  onDirtyChange,
  onMutated,
  onOneTimeSecretPendingChange,
}: Props) {
  const [form] = Form.useForm<OidcFormValues>();
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const configured = client.oidcState !== OidcClientState.Unconfigured;
  const confidential =
    client.oidcConfig?.clientType === OidcClientType.Confidential;

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(initialValues(client));
  }, [client, form]);

  useEffect(() => {
    onDirtyChange(formDirty);
  }, [formDirty, onDirtyChange]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : 'OIDC 操作失败');

  const runAction = async (
    title: string,
    content: string,
    action: () => Promise<{
      client: ClientDetailVo;
      clientSecret?: string;
    }>,
  ) => {
    if (!(await confirmClientSettingAction(title, content))) return;
    try {
      const result = await action();
      if (result.clientSecret) {
        setOneTimeSecret(result.clientSecret);
      }
      message.success('OIDC 操作成功');
      await onMutated();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space wrap>
          <Typography.Text strong>OIDC 状态</Typography.Text>
          <Tag
            color={
              client.oidcState === OidcClientState.Enabled
                ? 'green'
                : client.oidcState === OidcClientState.Disabled
                  ? 'orange'
                  : 'default'
            }
          >
            {
              {
                [OidcClientState.Unconfigured]: '未配置',
                [OidcClientState.Disabled]: '已禁用',
                [OidcClientState.Enabled]: '已启用',
              }[client.oidcState]
            }
          </Tag>
          <Typography.Text type="secondary">
            配置版本 {client.oidcConfigVersion}
          </Typography.Text>
          {confidential && (
            <Tag color={client.hasOidcSecret ? 'green' : 'red'}>
              {client.hasOidcSecret ? 'secret 已设置' : 'secret 缺失'}
            </Tag>
          )}
        </Space>
      </Card>

      <Alert
        type="warning"
        showIcon
        message="Redirect URI 按原始完整字符串精确匹配"
        description="允许 HTTP/HTTPS 与 query；禁止 fragment、通配符和模板变量。生产 HTTP 会暴露传输风险。"
      />

      <Card title="OIDC 配置">
        <Form<OidcFormValues>
          form={form}
          layout="vertical"
          onValuesChange={() => setFormDirty(true)}
          onFinish={async (values) => {
            if (
              client.oidcConfig &&
              client.oidcConfig.clientType !== values.clientType &&
              !(await confirmClientSettingAction(
                '确认切换 OIDC client 类型？',
                values.clientType === OidcClientType.Public
                  ? '切换为 public 会立即清除现有 OIDC secret，旧 secret 随即失效。'
                  : '切换为 confidential 会生成新的 secret，并且只显示一次。',
              ))
            ) {
              return;
            }

            const common = {
              redirectUris: normalizeClientSettingList(values.redirectUris),
              postLogoutRedirectUris: normalizeClientSettingList(
                values.postLogoutRedirectUris,
              ),
              allowedScopes: [...new Set(values.allowedScopes)],
            };
            const data: ClientOidcConfigureInput =
              values.clientType === OidcClientType.Public
                ? {
                    ...common,
                    clientType: OidcClientType.Public,
                    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
                  }
                : {
                    ...common,
                    clientType: OidcClientType.Confidential,
                    tokenEndpointAuthMethod:
                      OidcTokenEndpointAuthMethod.ClientSecretBasic,
                  };

            setSaving(true);
            try {
              const result = await configureClientOidc(client.clientCode, data);
              setFormDirty(false);
              if (result.clientSecret) {
                setOneTimeSecret(result.clientSecret);
              }
              message.success(
                configured
                  ? 'OIDC 配置已更新'
                  : 'OIDC 配置已保存，当前保持禁用',
              );
              await onMutated();
            } catch (err) {
              handleError(err);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item
            name="clientType"
            label="Client 类型"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio.Button value={OidcClientType.Public}>
                Public（PKCE）
              </Radio.Button>
              <Radio.Button value={OidcClientType.Confidential}>
                Confidential（PKCE + client_secret_basic）
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="allowedScopes"
            label="Allowed scopes"
            rules={[
              { required: true, message: '至少选择 openid' },
              {
                validator: async (_, value: OidcScope[]) => {
                  if (!value?.includes(OidcScope.OpenId)) {
                    throw new Error('allowed scopes 必须包含 openid');
                  }
                },
              },
            ]}
          >
            <Select mode="multiple" options={scopeOptions} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="iam:authorization 是敏感 scope"
            description="UserInfo 会返回全部有效任职，并仅返回当前应用的角色和由这些角色派生的权限。"
            style={{ marginBottom: 24 }}
          />
          <Form.Item
            name="redirectUris"
            label="Redirect URIs"
            rules={[{ required: true, message: '至少配置一个 redirect URI' }]}
          >
            <Select
              mode="tags"
              open={false}
              tokenSeparators={['\n']}
              placeholder="输入完整 URI 后按 Enter"
            />
          </Form.Item>
          <Form.Item
            name="postLogoutRedirectUris"
            label="Post logout redirect URIs"
          >
            <Select
              mode="tags"
              open={false}
              tokenSeparators={['\n']}
              placeholder="可留空；输入完整 URI 后按 Enter"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存 OIDC 配置
          </Button>
        </Form>
      </Card>

      <Card title="生命周期操作">
        <Space wrap>
          <Button
            disabled={
              formDirty ||
              client.oidcState !== OidcClientState.Disabled ||
              client.status !== ClientStatus.Enable
            }
            onClick={() =>
              runAction(
                '启用 OIDC？',
                '启用后该 client 可立即发起 OIDC 请求。',
                () => enableClientOidc(client.clientCode),
              )
            }
          >
            启用
          </Button>
          <Button
            disabled={formDirty || client.oidcState !== OidcClientState.Enabled}
            onClick={() =>
              runAction(
                '禁用 OIDC？',
                '禁用会立即使旧协议对象失效，但会保留配置与 secret 摘要。',
                () => disableClientOidc(client.clientCode),
              )
            }
          >
            禁用
          </Button>
          <Button
            disabled={formDirty || !confidential}
            onClick={() =>
              runAction(
                '轮换 OIDC secret？',
                '旧 secret 会立即失效，新 secret 仅显示一次。',
                () => rotateClientOidcSecret(client.clientCode),
              )
            }
          >
            轮换 secret
          </Button>
          <Button
            danger
            disabled={
              formDirty || client.oidcState !== OidcClientState.Disabled
            }
            onClick={() =>
              runAction(
                '移除 OIDC 配置？',
                '将清除 OIDC 配置和 secret 摘要，不影响基础信息或 Custom SSO。',
                () => removeClientOidc(client.clientCode),
              )
            }
          >
            移除配置
          </Button>
        </Space>
      </Card>

      <OneTimeSecretModal
        protocol="OIDC"
        secret={oneTimeSecret}
        onConfirmed={() => setOneTimeSecret(null)}
        onPendingChange={onOneTimeSecretPendingChange}
      />
    </Space>
  );
}
