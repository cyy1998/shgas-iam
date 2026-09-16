import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  ClientSsoMutationRejectedError,
  ClientSsoSecretReadError,
  clientSsoService,
  type ClientSsoDetail,
  type ClientSsoSecret,
} from '@admin/services/client-sso';
import {
  ClientSsoCallbackType,
  ClientSsoConfigSchema,
  ClientSsoProtocol,
  OidcClientType,
  OidcScope,
  SUBJECT_CLAIMS,
} from '@iam/contracts';
import { history, useParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

type FormValues = {
  protocol: ClientSsoProtocol;
  clientType: OidcClientType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: OidcScope[];
  callbackType: ClientSsoCallbackType;
  callbackEndpoint: string;
  validRedirectUrls: string[];
  subjectClaims: string[];
  orcas: boolean;
};

export default function ClientSsoPage() {
  const { clientCode = '' } = useParams<{ clientCode: string }>();
  const [client, setClient] = useState<ClientSsoDetail>();
  const [error, setError] = useState(false);
  const noticeKey = `client-sso-repair:${clientCode}`;
  const [repairNotice, setRepairNotice] = useState<string | undefined>(
    () => sessionStorage.getItem(noticeKey) ?? undefined,
  );
  const [operationNotice, setOperationNotice] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const dirtyFieldsRef = useRef(new Set<keyof FormValues>());
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<ClientSsoSecret>();
  const secretRequestRef = useRef(0);
  const [form] = Form.useForm<FormValues>();
  const protocol = Form.useWatch('protocol', form);

  const refresh = useCallback(
    async (savedFields: (keyof FormValues)[] = []) => {
      secretRequestRef.current += 1;
      setSecret(undefined);
      try {
        const value = await clientSsoService.detail(clientCode);
        setClient(value);
        for (const field of savedFields) dirtyFieldsRef.current.delete(field);
        setDirty(dirtyFieldsRef.current.size > 0);
        setError(false);
        const config = value.ssoConfig;
        const refreshed: Partial<FormValues> = {
          protocol: config?.protocol,
          clientType:
            config?.protocol === ClientSsoProtocol.Oidc
              ? config.clientType
              : OidcClientType.Public,
          redirectUris:
            config?.protocol === ClientSsoProtocol.Oidc
              ? config.redirectUris
              : [],
          postLogoutRedirectUris:
            config?.protocol === ClientSsoProtocol.Oidc
              ? config.postLogoutRedirectUris
              : [],
          allowedScopes:
            config?.protocol === ClientSsoProtocol.Oidc
              ? config.allowedScopes
              : [OidcScope.OpenId],
          callbackType:
            config?.protocol === ClientSsoProtocol.CustomSso
              ? config.callbackType
              : undefined,
          callbackEndpoint:
            config?.protocol === ClientSsoProtocol.CustomSso
              ? config.callbackEndpoint
              : '',
          validRedirectUrls:
            config?.protocol === ClientSsoProtocol.CustomSso
              ? config.validRedirectUrls
              : [],
          subjectClaims:
            config?.protocol === ClientSsoProtocol.CustomSso
              ? config.subjectClaims
              : ['subjectIdentifier'],
          orcas:
            config?.protocol === ClientSsoProtocol.CustomSso &&
            config.orcas?.enabled === true,
        };
        for (const field of dirtyFieldsRef.current) delete refreshed[field];
        form.setFieldsValue(refreshed);
      } catch {
        setError(true);
      }
    },
    [clientCode, form],
  );
  useEffect(() => {
    void refresh();
    return () => {
      secretRequestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!dirty) return;
    let confirmationOpen = false;
    const unblock = history.block((transition) => {
      if (confirmationOpen) return;
      confirmationOpen = true;
      Modal.confirm({
        title: '放弃未保存的修改？',
        content: '当前分区的修改不会自动保存或保留草稿。',
        okText: '放弃修改',
        okType: 'danger',
        onOk: () => {
          unblock();
          dirtyFieldsRef.current.clear();
          setDirty(false);
          setSecret(undefined);
          transition.retry();
        },
        onCancel: () => {
          confirmationOpen = false;
        },
      });
    });
    return unblock;
  }, [dirty]);

  async function run(
    operation: () => ReturnType<typeof clientSsoService.save>,
    savedFields: (keyof FormValues)[] = [],
  ) {
    setBusy(true);
    setSecret(undefined);
    setOperationNotice(undefined);
    try {
      const result = await operation();
      message.success(result.changed ? '已保存' : '无需修改');
      await refresh(savedFields);
    } catch (failure) {
      if (failure instanceof AdminMutationCommittedError) {
        const nextNotice =
          '操作已提交，但缓存同步失败或未确认。旧配置或旧 Secret 可能仍生效；请联系管理员修复传播。刷新或读取 Secret 成功不代表传播已修复。';
        setRepairNotice(nextNotice);
        sessionStorage.setItem(noticeKey, nextNotice);
      } else {
        setOperationNotice(
          failure instanceof ClientSsoMutationRejectedError
            ? failure.message
            : '操作未确认成功，可能已经生效。请刷新核对后再明确发起操作，不要自动重试。',
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function readSecret() {
    const requestId = ++secretRequestRef.current;
    setBusy(true);
    setSecret(undefined);
    setOperationNotice(undefined);
    try {
      const current = await clientSsoService.readSecret(clientCode);
      if (requestId !== secretRequestRef.current) return;
      setSecret(current);
      message.success(
        current ? '已审计并读取当前 Secret' : '当前没有 SSO Secret',
      );
    } catch (failure) {
      if (requestId !== secretRequestRef.current) return;
      setOperationNotice(
        failure instanceof ClientSsoSecretReadError
          ? failure.message
          : '当前 Secret 未取得，请主动重新读取。',
      );
    } finally {
      setBusy(false);
    }
  }

  function saveConfig() {
    const values = form.getFieldsValue();
    if (!values.protocol) {
      message.error('请选择 SSO 协议');
      return;
    }
    const parsed = ClientSsoConfigSchema.safeParse(
      values.protocol === ClientSsoProtocol.Oidc
        ? {
            protocol: values.protocol,
            clientType: values.clientType,
            redirectUris: values.redirectUris,
            postLogoutRedirectUris: values.postLogoutRedirectUris,
            allowedScopes: values.allowedScopes,
          }
        : {
            protocol: values.protocol,
            callbackType: values.callbackType,
            callbackEndpoint: values.callbackEndpoint,
            validRedirectUrls: values.validRedirectUrls,
            subjectClaims: values.subjectClaims,
            ...(values.orcas ? { orcas: { enabled: true } } : {}),
          },
    );
    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? '配置无效');
      return;
    }
    void run(
      () => clientSsoService.selectProtocol(clientCode, parsed.data),
      [
        'protocol',
        'clientType',
        'redirectUris',
        'postLogoutRedirectUris',
        'allowedScopes',
        'callbackType',
        'callbackEndpoint',
        'validRedirectUrls',
        'subjectClaims',
        'orcas',
      ],
    );
  }

  if (!client && !error) return <Spin aria-label="加载应用" />;
  return (
    <Space
      orientation="vertical"
      size={16}
      style={{
        width: '100%',
        maxWidth: 960,
        display: 'flex',
        margin: '0 auto',
      }}
    >
      {repairNotice && <Alert type="warning" showIcon title={repairNotice} />}
      {operationNotice && (
        <Alert type="error" showIcon title={operationNotice} />
      )}
      {error && (
        <Alert
          type="error"
          title="应用详情加载失败"
          action={<Button onClick={() => void refresh()}>刷新</Button>}
        />
      )}
      {client && (
        <Card
          title="SSO配置"
          extra={
            <Button disabled={busy} onClick={() => void refresh()}>
              刷新详情
            </Button>
          }
        >
          <Form
            form={form}
            layout="vertical"
            disabled={busy || error}
            onValuesChange={(changed: Partial<FormValues>) => {
              for (const field of Object.keys(changed) as (keyof FormValues)[])
                dirtyFieldsRef.current.add(field);
              setDirty(true);
            }}
          >
            <Form.Item name="protocol" label="SSO 协议">
              <Select
                placeholder="请选择 SSO 协议"
                options={[
                  { value: ClientSsoProtocol.Oidc, label: 'OIDC' },
                  {
                    value: ClientSsoProtocol.CustomSso,
                    label: 'Custom SSO',
                  },
                ]}
              />
            </Form.Item>
            {protocol === ClientSsoProtocol.Oidc && (
              <>
                <Form.Item name="clientType" label="OIDC 客户端类型">
                  <Select
                    options={[
                      {
                        value: OidcClientType.Public,
                        label: 'Public（none + S256）',
                      },
                      {
                        value: OidcClientType.Confidential,
                        label: 'Confidential（client_secret_basic + S256）',
                      },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="redirectUris" label="登录Redirect URIs">
                  <Select mode="tags" open={false} suffixIcon={null} />
                </Form.Item>
                <Form.Item
                  name="postLogoutRedirectUris"
                  label="登出Redirect URIs"
                >
                  <Select mode="tags" open={false} suffixIcon={null} />
                </Form.Item>
                <Form.Item name="allowedScopes" label="披露 scope">
                  <Select
                    mode="multiple"
                    options={Object.values(OidcScope).map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Form.Item>
              </>
            )}
            {protocol === ClientSsoProtocol.CustomSso && (
              <>
                <Form.Item name="callbackType" label="回调类型" required>
                  <Select
                    placeholder="请选择回调类型"
                    options={[
                      {
                        value: ClientSsoCallbackType.Managed,
                        label: '托管回调',
                      },
                      {
                        value: ClientSsoCallbackType.Business,
                        label: '业务回调',
                      },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="callbackEndpoint" label="回调地址">
                  <Input />
                </Form.Item>
                <Form.Item name="validRedirectUrls" label="Redirect URIs">
                  <Select mode="tags" open={false} suffixIcon={null} />
                </Form.Item>
                <Form.Item name="subjectClaims" label="主体披露字段">
                  <Select
                    mode="multiple"
                    options={SUBJECT_CLAIMS.map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="orcas" valuePropName="checked">
                  <Checkbox>托管交付启用 ORCAS</Checkbox>
                </Form.Item>
              </>
            )}
            <Space
              wrap
              style={{
                width: '100%',
                borderTop:
                  '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                paddingTop: 20,
              }}
            >
              <Button
                type="primary"
                disabled={
                  busy || error || !client.allowedActions.selectProtocol
                }
                onClick={saveConfig}
              >
                保存协议及配置
              </Button>
              <Button
                disabled={
                  busy ||
                  error ||
                  dirty ||
                  !client.allowedActions.setEnabled ||
                  client.ssoConfig === null
                }
                onClick={() =>
                  void run(() =>
                    clientSsoService.setEnabled(clientCode, !client.ssoEnabled),
                  )
                }
              >
                {client.ssoEnabled ? '停用 SSO' : '启用 SSO'}
              </Button>
              <Button
                danger
                disabled={
                  busy ||
                  error ||
                  !client.allowedActions.selectProtocol ||
                  client.ssoConfig === null
                }
                onClick={() => {
                  Modal.confirm({
                    title: '移除 SSO 配置？',
                    content:
                      '将删除已保存的协议配置并关闭 SSO，当前未保存的修改也会丢弃。再次使用时需要重新配置。',
                    okText: '移除配置',
                    cancelText: '取消',
                    okType: 'danger',
                    onOk: () =>
                      run(
                        () => clientSsoService.selectProtocol(clientCode, null),
                        Object.keys(
                          form.getFieldsValue(true),
                        ) as (keyof FormValues)[],
                      ),
                  });
                }}
              >
                移除 SSO 配置
              </Button>
            </Space>
          </Form>
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
            }}
          >
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Typography.Text strong>SSO Secret</Typography.Text>
              <Space wrap>
                <Button
                  disabled={
                    busy ||
                    dirty ||
                    error ||
                    !client.allowedActions.rotateSecret
                  }
                  onClick={() =>
                    void run(() => clientSsoService.rotateSecret(clientCode))
                  }
                >
                  轮换 SSO Secret
                </Button>
                <Button
                  disabled={busy || error || !client.allowedActions.readSecret}
                  onClick={() => void readSecret()}
                >
                  读取当前 Secret
                </Button>
              </Space>
              {secret && (
                <Alert
                  type="info"
                  title="本次审计读取的 Secret"
                  description={
                    <Space orientation="vertical">
                      <Typography.Text code>{secret.secret}</Typography.Text>
                      <Typography.Text>
                        凭据身份：{secret.credentialId}；更新时间：
                        {secret.updatedAt}
                      </Typography.Text>
                      <Button onClick={() => setSecret(undefined)}>
                        隐藏 Secret
                      </Button>
                    </Space>
                  }
                />
              )}
            </Space>
          </div>
        </Card>
      )}
    </Space>
  );
}
