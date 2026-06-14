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
  ModalForm,
  ProFormGroup,
  ProFormSelect,
} from '@ant-design/pro-components';
import {
  ClientStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from '@iam/contracts';
import { Alert, Button, message, Modal, Space, Tag, Typography } from 'antd';

type Props = {
  open: boolean;
  client: ClientDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type FormValues = {
  clientType: OidcClientType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: OidcScope[];
};

const scopeOptions = [
  { label: 'openid', value: OidcScope.OpenId },
  { label: 'profile', value: OidcScope.Profile },
  { label: 'phone', value: OidcScope.Phone },
  {
    label: 'iam:authorization（敏感）',
    value: OidcScope.IamAuthorization,
  },
];

function cleanList(value: string[] | undefined) {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))];
}

function showOneTimeSecret(secret: string) {
  Modal.warning({
    title: 'OIDC client secret 仅显示一次',
    width: 620,
    content: (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text>
          请立即保存。关闭此弹窗后，系统只会保留 bcrypt 摘要，无法再次查看明文。
        </Typography.Text>
        <Typography.Text code copyable={{ text: secret }}>
          {secret}
        </Typography.Text>
      </Space>
    ),
  });
}

function confirmAction(title: string, content: string) {
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title,
      content,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function initialValues(client: ClientDetailVo | null): FormValues {
  return {
    clientType: client?.oidcConfig?.clientType ?? OidcClientType.Public,
    redirectUris: client?.oidcConfig?.redirectUris ?? [],
    postLogoutRedirectUris: client?.oidcConfig?.postLogoutRedirectUris ?? [],
    allowedScopes: client?.oidcConfig?.allowedScopes ?? [OidcScope.OpenId],
  };
}

export default function OidcConfigModal({
  open,
  client,
  onOpenChange,
  onSuccess,
}: Props) {
  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : 'OIDC 操作失败');

  const runAction = async (
    title: string,
    content: string,
    action: () => Promise<{ client: ClientDetailVo; clientSecret?: string }>,
  ) => {
    if (!(await confirmAction(title, content))) return;
    try {
      const result = await action();
      if (result.clientSecret) showOneTimeSecret(result.clientSecret);
      message.success('操作成功');
      onSuccess?.();
    } catch (err) {
      handleError(err);
    }
  };

  if (!client) return null;

  const configured = client.oidcState !== OidcClientState.Unconfigured;
  const confidential =
    client.oidcConfig?.clientType === OidcClientType.Confidential;

  return (
    <ModalForm<FormValues>
      title={`OIDC 配置：${client.clientName}`}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={initialValues(client)}
      modalProps={{ destroyOnClose: true, maskClosable: false, width: 760 }}
      submitter={{ searchConfig: { submitText: '保存 OIDC 配置' } }}
      onFinish={async (values) => {
        if (
          client.oidcConfig &&
          client.oidcConfig.clientType !== values.clientType &&
          !(await confirmAction(
            '确认切换 OIDC client 类型？',
            values.clientType === OidcClientType.Public
              ? '切换为 public 会立即清除现有 OIDC secret，旧 secret 随即失效。'
              : '切换为 confidential 会生成新的 secret，并且只显示一次。',
          ))
        ) {
          return false;
        }

        const data: ClientOidcConfigureInput = {
          clientType: values.clientType,
          redirectUris: cleanList(values.redirectUris),
          postLogoutRedirectUris: cleanList(values.postLogoutRedirectUris),
          allowedScopes: [...new Set(values.allowedScopes)],
          tokenEndpointAuthMethod:
            values.clientType === OidcClientType.Public
              ? OidcTokenEndpointAuthMethod.None
              : OidcTokenEndpointAuthMethod.ClientSecretBasic,
        } as ClientOidcConfigureInput;

        try {
          const result = await configureClientOidc(client.clientCode, data);
          if (result.clientSecret) showOneTimeSecret(result.clientSecret);
          message.success(
            configured ? 'OIDC 配置已更新' : 'OIDC 配置已保存，当前保持禁用',
          );
          onSuccess?.();
          return true;
        } catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Typography.Text strong>client_id:</Typography.Text>
          <Typography.Text code>{client.clientCode}</Typography.Text>
          <Tag>{client.oidcState}</Tag>
          {confidential && (
            <Tag color={client.hasOidcSecret ? 'green' : 'red'}>
              {client.hasOidcSecret ? 'secret 已设置' : 'secret 缺失'}
            </Tag>
          )}
        </Space>

        <Alert
          type="warning"
          showIcon
          message="redirect URI 按原始完整字符串精确匹配"
          description="允许 HTTP/HTTPS 与 query；禁止 fragment、通配符和模板变量。生产 HTTP 会暴露传输风险。"
        />

        <Space wrap>
          <Button
            disabled={
              client.oidcState !== OidcClientState.Disabled ||
              client.status !== ClientStatus.Enable
            }
            onClick={() =>
              runAction(
                '启用 OIDC？',
                client.status === ClientStatus.Enable
                  ? '启用后该 client 可立即发起 OIDC 请求。'
                  : '当前 client 全局状态不正常，无法启用 OIDC。',
                () => enableClientOidc(client.clientCode),
              )
            }
          >
            启用
          </Button>
          <Button
            disabled={client.oidcState !== OidcClientState.Enabled}
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
            disabled={!confidential}
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
            disabled={client.oidcState !== OidcClientState.Disabled}
            onClick={() =>
              runAction(
                '移除 OIDC 配置？',
                '将清除 OIDC 配置和 secret 摘要，不影响 client 主体、角色或 custom SSO。',
                () => removeClientOidc(client.clientCode),
              )
            }
          >
            移除配置
          </Button>
        </Space>
      </Space>

      <ProFormGroup>
        <ProFormSelect
          name="clientType"
          label="Client 类型"
          width="md"
          options={[
            { label: 'Public（PKCE）', value: OidcClientType.Public },
            {
              label: 'Confidential（PKCE + client_secret_basic）',
              value: OidcClientType.Confidential,
            },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="allowedScopes"
          label="Allowed scopes"
          width="md"
          mode="multiple"
          options={scopeOptions}
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
        />
      </ProFormGroup>

      <Alert
        type="info"
        showIcon
        message="iam:authorization 是敏感 scope"
        description="UserInfo 会返回全部有效任职，并仅返回当前应用的角色和由这些角色派生的权限。"
      />

      <ProFormSelect
        name="redirectUris"
        label="Redirect URIs"
        mode="tags"
        fieldProps={{
          open: false,
          tokenSeparators: ['\n'],
          placeholder:
            '输入完整 URI 后按 Enter，例如 https://app.example.com/callback',
        }}
        rules={[{ required: true, message: '至少配置一个 redirect URI' }]}
      />
      <ProFormSelect
        name="postLogoutRedirectUris"
        label="Post logout redirect URIs"
        mode="tags"
        fieldProps={{
          open: false,
          tokenSeparators: ['\n'],
          placeholder: '可留空；输入完整 URI 后按 Enter',
        }}
      />
    </ModalForm>
  );
}
