import {
  buildCustomSsoPlaceholderPreviewV1,
  CUSTOM_SSO_CLAIM_CATALOG,
} from '@admin/pages/clients/customSsoCatalog';
import {
  type ClientCustomSsoConfigureInput,
  type ClientDetailVo,
  configureClientCustomSso,
  disableClientCustomSso,
  enableClientCustomSso,
  removeClientCustomSso,
  rotateClientCustomSsoSecret,
} from '@admin/services/client';
import {
  ClientStatus,
  CustomSsoClientMode,
  CustomSsoClientState,
  SUBJECT_CLAIMS_V1,
  SubjectClaim,
  type SubjectClaimName,
} from '@iam/contracts';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  message,
  Radio,
  Select,
  Space,
  Switch,
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

type CustomSsoFormValues = {
  mode: CustomSsoClientMode;
  validRedirectUrls: string[];
  subjectClaims: SubjectClaimName[];
  orcasEnabled: boolean;
  callbackEndpoint?: string;
  logoutEndpoint?: string;
};

const stateLabels = {
  [CustomSsoClientState.Unconfigured]: '未配置',
  [CustomSsoClientState.Disabled]: '已禁用',
  [CustomSsoClientState.Enabled]: '已启用',
} as const;

function initialValues(client: ClientDetailVo): CustomSsoFormValues {
  const config = client.customSsoConfig;
  return {
    mode: config?.mode ?? CustomSsoClientMode.Gateway,
    validRedirectUrls: config?.validRedirectUrls ?? [],
    subjectClaims: config?.subjectClaims ?? [SubjectClaim.SubjectIdentifier],
    orcasEnabled:
      config?.mode === CustomSsoClientMode.Gateway
        ? config.orcas.enabled
        : false,
    callbackEndpoint:
      config?.mode === CustomSsoClientMode.Independent
        ? config.callbackEndpoint
        : undefined,
    logoutEndpoint:
      config?.mode === CustomSsoClientMode.Independent
        ? config.logoutEndpoint
        : undefined,
  };
}

export default function CustomSsoSettings({
  client,
  onDirtyChange,
  onMutated,
  onOneTimeSecretPendingChange,
}: Props) {
  const [form] = Form.useForm<CustomSsoFormValues>();
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const mode = Form.useWatch('mode', form);
  const subjectClaims =
    Form.useWatch('subjectClaims', form) ?? initialValues(client).subjectClaims;
  const enabled = client.customSsoState === CustomSsoClientState.Enabled;
  const configured =
    client.customSsoState !== CustomSsoClientState.Unconfigured;

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(initialValues(client));
  }, [client, form]);

  useEffect(() => {
    onDirtyChange(formDirty);
  }, [formDirty, onDirtyChange]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : 'Custom SSO 操作失败');

  const runAction = async (
    title: string,
    content: string,
    action: () => Promise<{
      client: ClientDetailVo;
      customSsoSecret?: string;
    }>,
  ) => {
    if (!(await confirmClientSettingAction(title, content))) return;
    try {
      const result = await action();
      if (result.customSsoSecret) {
        setOneTimeSecret(result.customSsoSecret);
      }
      message.success('Custom SSO 操作成功');
      await onMutated();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space wrap>
          <Typography.Text strong>Custom SSO 状态</Typography.Text>
          <Tag
            color={
              client.customSsoState === CustomSsoClientState.Enabled
                ? 'green'
                : client.customSsoState === CustomSsoClientState.Disabled
                  ? 'orange'
                  : 'default'
            }
          >
            {stateLabels[client.customSsoState]}
          </Tag>
          {client.customSsoMode && <Tag>{client.customSsoMode}</Tag>}
          <Typography.Text type="secondary">
            配置版本 {client.customSsoConfigVersion}
          </Typography.Text>
          {client.customSsoMode === CustomSsoClientMode.Independent && (
            <Tag color={client.hasCustomSsoSecret ? 'green' : 'red'}>
              {client.hasCustomSsoSecret ? 'secret 已设置' : 'secret 缺失'}
            </Tag>
          )}
        </Space>
      </Card>

      {enabled && (
        <Alert
          type="info"
          showIcon
          message="已启用的 Custom SSO 配置只读"
          description="如需修改配置、切换模式、移除配置或轮换 secret，请先禁用。"
        />
      )}

      <Card title="Custom SSO 配置">
        <Form<CustomSsoFormValues>
          form={form}
          layout="vertical"
          disabled={enabled}
          onValuesChange={() => setFormDirty(true)}
          onFinish={async (values) => {
            if (
              client.customSsoMode &&
              client.customSsoMode !== values.mode &&
              !(await confirmClientSettingAction(
                '确认切换 Custom SSO 模式？',
                values.mode === CustomSsoClientMode.Independent
                  ? '切换为 Independent 会生成只显示一次的新 secret。'
                  : '切换为 Gateway 会立即清除现有 Custom SSO secret 摘要。',
              ))
            ) {
              return;
            }

            const orderedClaims = SUBJECT_CLAIMS_V1.filter((claim) =>
              values.subjectClaims.includes(claim),
            );
            const common = {
              mode: values.mode,
              validRedirectUrls: normalizeClientSettingList(
                values.validRedirectUrls,
              ),
              subjectClaimCatalogVersion: 1 as const,
              subjectClaims: orderedClaims,
            };
            const data: ClientCustomSsoConfigureInput =
              values.mode === CustomSsoClientMode.Gateway
                ? {
                    ...common,
                    mode: CustomSsoClientMode.Gateway,
                    orcas: { enabled: values.orcasEnabled ?? false },
                  }
                : {
                    ...common,
                    mode: CustomSsoClientMode.Independent,
                    callbackEndpoint: values.callbackEndpoint ?? '',
                    logoutEndpoint: values.logoutEndpoint ?? '',
                  };

            setSaving(true);
            try {
              const result = await configureClientCustomSso(
                client.clientCode,
                data,
              );
              setFormDirty(false);
              if ('customSsoSecret' in result && result.customSsoSecret) {
                setOneTimeSecret(result.customSsoSecret);
              }
              message.success(
                configured
                  ? 'Custom SSO 配置已更新'
                  : 'Custom SSO 配置已保存，当前保持禁用',
              );
              await onMutated();
            } catch (err) {
              handleError(err);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item name="mode" label="接入模式" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value={CustomSsoClientMode.Gateway}>
                Gateway
              </Radio.Button>
              <Radio.Button value={CustomSsoClientMode.Independent}>
                Independent
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="validRedirectUrls"
            label="允许的 Redirect Patterns"
            extra="无通配时精确匹配；仅支持一级子域 *. 和路径末尾 /*。命中通配 Pattern 的地址可携带查询参数。"
            rules={[
              {
                required: true,
                message: '至少配置一个 Redirect Pattern',
              },
            ]}
          >
            <Select
              mode="tags"
              open={false}
              tokenSeparators={['\n']}
              placeholder="例如 https://app.example.com/callback"
            />
          </Form.Item>

          {mode === CustomSsoClientMode.Gateway && (
            <Form.Item
              name="orcasEnabled"
              label="ORCAS capability"
              valuePropName="checked"
            >
              <Switch checkedChildren="启用" unCheckedChildren="关闭" />
            </Form.Item>
          )}

          {mode === CustomSsoClientMode.Independent && (
            <>
              <Form.Item
                name="callbackEndpoint"
                label="Callback Endpoint"
                rules={[
                  { required: true, message: '请输入 Callback Endpoint' },
                  { type: 'url', message: '请输入有效 URL' },
                ]}
              >
                <Input placeholder="https://app.example.com/sso/callback" />
              </Form.Item>
              <Form.Item
                name="logoutEndpoint"
                label="Logout Endpoint"
                rules={[
                  { required: true, message: '请输入 Logout Endpoint' },
                  { type: 'url', message: '请输入有效 URL' },
                ]}
              >
                <Input placeholder="https://app.example.com/logout" />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="subjectClaims"
            label="Subject Claims"
            rules={[
              {
                validator: async (_, claims: SubjectClaimName[]) => {
                  if (!claims?.includes(SubjectClaim.SubjectIdentifier)) {
                    throw new Error('必须包含 Subject Identifier');
                  }
                },
              },
            ]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Space
                orientation="vertical"
                size="middle"
                style={{ width: '100%' }}
              >
                <div>
                  <Typography.Text strong>固定身份</Typography.Text>
                  {CUSTOM_SSO_CLAIM_CATALOG.filter(
                    (claim) => claim.group === 'identity',
                  ).map((claim) => (
                    <div key={claim.claim}>
                      <Checkbox value={claim.claim} disabled>
                        {claim.label}
                      </Checkbox>
                      <Typography.Text type="secondary">
                        {claim.description}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
                <div>
                  <Typography.Text strong>Profile</Typography.Text>
                  {CUSTOM_SSO_CLAIM_CATALOG.filter(
                    (claim) => claim.group === 'profile',
                  ).map((claim) => (
                    <div key={claim.claim}>
                      <Checkbox value={claim.claim}>{claim.label}</Checkbox>
                      <Typography.Text type="secondary">
                        {claim.description}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
                <div>
                  <Typography.Text strong>Authorization</Typography.Text>
                  {CUSTOM_SSO_CLAIM_CATALOG.filter(
                    (claim) => claim.group === 'authorization',
                  ).map((claim) => (
                    <div key={claim.claim}>
                      <Checkbox value={claim.claim}>{claim.label}</Checkbox>
                      <Typography.Text type="secondary">
                        {claim.description}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
              </Space>
            </Checkbox.Group>
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={saving}>
            保存 Custom SSO 配置
          </Button>
        </Form>
      </Card>

      <Card title="固定占位符 Wire Preview">
        <Typography.Paragraph type="secondary">
          预览只使用固定示例，不查询真实用户。未选择字段及空父对象会省略；已选择的数组字段即使为空也会保留。
        </Typography.Paragraph>
        <pre data-testid="custom-sso-wire-preview">
          {JSON.stringify(
            buildCustomSsoPlaceholderPreviewV1(subjectClaims),
            null,
            2,
          )}
        </pre>
      </Card>

      <Card title="生命周期操作">
        <Space wrap>
          <Button
            disabled={
              formDirty ||
              client.customSsoState !== CustomSsoClientState.Disabled ||
              client.status !== ClientStatus.Enable
            }
            onClick={() =>
              runAction(
                '启用 Custom SSO？',
                '启用只校验本地配置，不会访问 Redirect、Callback 或 Logout URL。',
                () => enableClientCustomSso(client.clientCode),
              )
            }
          >
            启用
          </Button>
          <Button
            disabled={
              formDirty ||
              client.customSsoState !== CustomSsoClientState.Enabled
            }
            onClick={() =>
              runAction(
                '禁用 Custom SSO？',
                '禁用会撤销已有协议对象，但保留配置和 Independent secret 摘要。',
                () => disableClientCustomSso(client.clientCode),
              )
            }
          >
            禁用
          </Button>
          <Button
            disabled={
              formDirty ||
              client.customSsoState !== CustomSsoClientState.Disabled ||
              client.customSsoMode !== CustomSsoClientMode.Independent
            }
            onClick={() =>
              runAction(
                '轮换 Custom SSO secret？',
                '旧 secret 会立即失效，新 secret 仅显示一次。',
                () => rotateClientCustomSsoSecret(client.clientCode),
              )
            }
          >
            轮换 secret
          </Button>
          <Button
            danger
            disabled={
              formDirty ||
              client.customSsoState !== CustomSsoClientState.Disabled
            }
            onClick={() =>
              runAction(
                '移除 Custom SSO 配置？',
                '配置会回到未配置状态，不影响基础信息或 OIDC。',
                () => removeClientCustomSso(client.clientCode),
              )
            }
          >
            移除配置
          </Button>
        </Space>
      </Card>

      <OneTimeSecretModal
        protocol="Custom SSO"
        secret={oneTimeSecret}
        onConfirmed={() => setOneTimeSecret(null)}
        onPendingChange={onOneTimeSecretPendingChange}
      />
    </Space>
  );
}
