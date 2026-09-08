import StatusTag from '@admin/components/StatusTag';
import BasicSettings from '@admin/pages/clients/components/BasicSettings';
import CustomSsoSettings from '@admin/pages/clients/components/CustomSsoSettings';
import OidcSettings from '@admin/pages/clients/components/OidcSettings';
import {
  ClientDetailError,
  ClientDetailErrorKind,
  type ClientDetailVo,
  getClient,
} from '@admin/services/client';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  message,
  Modal,
  Result,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientCommittedFailureKind } from './components/settingsHelpers';

type ClientSection = 'basic' | 'custom-sso' | 'oidc';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; client: ClientDetailVo }
  | { status: 'not-found' }
  | { status: 'error' };

const sections = new Set<ClientSection>(['basic', 'custom-sso', 'oidc']);

function parseSection(search: string): ClientSection {
  const value = new URLSearchParams(search).get('section');
  return sections.has(value as ClientSection)
    ? (value as ClientSection)
    : 'basic';
}

export default function ClientEditPage() {
  const params = useParams<{ clientCode: string }>();
  const location = useLocation();
  const clientCode = params.clientCode ?? '';
  const section = parseSection(location.search);
  const [repairMessage, setRepairMessage] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('committed') === '1'
      ? '操作已生效，但后续处理失败；请联系管理员修复传播。详情可读不代表传播已恢复。'
      : null,
  );
  const [loadState, setLoadState] = useState<LoadState>({
    status: 'loading',
  });
  const [dirty, setDirty] = useState<Record<ClientSection, boolean>>({
    basic: false,
    'custom-sso': false,
    oidc: false,
  });
  const [pendingOneTimeSecret, setPendingOneTimeSecret] = useState({
    'custom-sso': false,
    oidc: false,
  });
  const [discardRevision, setDiscardRevision] = useState<
    Record<ClientSection, number>
  >({
    basic: 0,
    'custom-sso': 0,
    oidc: 0,
  });
  const unblockRef = useRef<null | (() => void)>(null);

  const setBasicDirty = useCallback(
    (value: boolean) =>
      setDirty((current) =>
        current.basic === value ? current : { ...current, basic: value },
      ),
    [],
  );
  const setCustomSsoDirty = useCallback(
    (value: boolean) =>
      setDirty((current) =>
        current['custom-sso'] === value
          ? current
          : { ...current, 'custom-sso': value },
      ),
    [],
  );
  const setOidcDirty = useCallback(
    (value: boolean) =>
      setDirty((current) =>
        current.oidc === value ? current : { ...current, oidc: value },
      ),
    [],
  );
  const setCustomSsoOneTimeSecretPending = useCallback(
    (value: boolean) =>
      setPendingOneTimeSecret((current) =>
        current['custom-sso'] === value
          ? current
          : { ...current, 'custom-sso': value },
      ),
    [],
  );
  const setOidcOneTimeSecretPending = useCallback(
    (value: boolean) =>
      setPendingOneTimeSecret((current) =>
        current.oidc === value ? current : { ...current, oidc: value },
      ),
    [],
  );

  const loadClient = useCallback(async () => {
    try {
      const client = await getClient(clientCode);
      setLoadState({ status: 'ready', client });
    } catch (error) {
      setLoadState({
        status:
          error instanceof ClientDetailError &&
          error.kind === ClientDetailErrorKind.NotFound
            ? 'not-found'
            : 'error',
      });
    }
  }, [clientCode]);

  const refreshClient = useCallback(async () => {
    try {
      const client = await getClient(clientCode);
      setLoadState({ status: 'ready', client });
    } catch {
      message.error(
        '操作已成功，但应用详情刷新失败；请先安全保存一次性 secret，再重试加载。',
      );
    }
  }, [clientCode]);

  const handleCommitted = async (
    kind: ClientCommittedFailureKind = 'mutation',
  ) => {
    setRepairMessage(
      kind === 'rotation'
        ? '轮换已生效，新 Secret 出现错误。请先联系管理员修复传播，再主动重新轮换。'
        : kind === 'configuration'
          ? '配置已生效，若生成了新 Secret，此次未交付。请先联系管理员修复传播，再主动轮换获取新 Secret。'
          : '操作已生效，但后续处理失败；请联系管理员修复传播。详情可读不代表传播已恢复。',
    );
    await loadClient();
  };

  const repairAlert = repairMessage ? (
    <Alert type="warning" showIcon title={repairMessage} />
  ) : null;

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('section');
    if (!sections.has(requested as ClientSection)) {
      history.replace(
        `/clients/${encodeURIComponent(clientCode)}/edit?section=basic`,
      );
    }
  }, [clientCode, location.search]);

  const hasDirtyChanges = useMemo(
    () => Object.values(dirty).some(Boolean),
    [dirty],
  );
  const hasPendingOneTimeSecret = useMemo(
    () => Object.values(pendingOneTimeSecret).some(Boolean),
    [pendingOneTimeSecret],
  );

  useEffect(() => {
    if (!hasDirtyChanges && !hasPendingOneTimeSecret) return;
    let confirmationOpen = false;
    const unblock = history.block((transition) => {
      if (hasPendingOneTimeSecret) {
        message.warning({
          key: 'client-one-time-secret-navigation-blocked',
          content: '请先在一次性 secret 弹窗中确认已安全保存，然后再离开页面。',
        });
        return;
      }
      if (confirmationOpen) return;
      confirmationOpen = true;
      Modal.confirm({
        title: '放弃未保存的修改？',
        content: '当前分区的修改不会自动保存或保留草稿。',
        okText: '放弃修改',
        okType: 'danger',
        onOk: () => {
          confirmationOpen = false;
          if (unblockRef.current === unblock) {
            unblockRef.current = null;
          }
          unblock();
          setDirty((current) => ({ ...current, [section]: false }));
          setDiscardRevision((current) => ({
            ...current,
            [section]: current[section] + 1,
          }));
          transition.retry();
        },
        onCancel: () => {
          confirmationOpen = false;
        },
      });
    });
    unblockRef.current = unblock;
    return () => {
      if (unblockRef.current === unblock) {
        unblockRef.current = null;
      }
      unblock();
    };
  }, [hasDirtyChanges, hasPendingOneTimeSecret, section]);

  const goToSection = (nextSection: ClientSection) => {
    if (nextSection === section) return;
    history.push(
      `/clients/${encodeURIComponent(clientCode)}/edit?section=${nextSection}`,
    );
  };

  const goBack = () => history.push('/clients');

  const leaveAfterDelete = () => {
    unblockRef.current?.();
    unblockRef.current = null;
    setDirty({
      basic: false,
      'custom-sso': false,
      oidc: false,
    });
    history.push('/clients');
  };

  if (loadState.status === 'loading') {
    return (
      <PageContainer title="加载应用">
        <Card loading data-testid="client-edit-loading" />
      </PageContainer>
    );
  }

  if (loadState.status === 'not-found') {
    return (
      <PageContainer>
        {repairAlert}
        <Result
          status="404"
          title="应用不存在"
          subTitle={`找不到应用 ${clientCode}，它可能已被删除。`}
          extra={
            <Button type="primary" onClick={() => history.push('/clients')}>
              返回应用列表
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (loadState.status === 'error') {
    return (
      <PageContainer>
        {repairAlert}
        <Result
          status="error"
          title="应用详情加载失败"
          subTitle="请检查网络后重试。"
          extra={
            <Space>
              <Button onClick={() => history.push('/clients')}>
                返回应用列表
              </Button>
              <Button type="primary" onClick={() => void loadClient()}>
                重试
              </Button>
            </Space>
          }
        />
      </PageContainer>
    );
  }

  const client = loadState.client;

  return (
    <PageContainer
      title={client.clientName}
      subTitle={
        <Space>
          <Typography.Text code>{client.clientCode}</Typography.Text>
          <StatusTag domain="client" status={client.status} />
        </Space>
      }
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={goBack}>
          返回应用列表
        </Button>
      }
    >
      {repairAlert}
      <Tabs
        activeKey={section}
        onChange={(key) => goToSection(key as ClientSection)}
        items={[
          {
            key: 'basic',
            label: '基础信息',
            children: (
              <BasicSettings
                key={`basic-${discardRevision.basic}`}
                client={client}
                onDirtyChange={setBasicDirty}
                onCommitted={handleCommitted}
                onMutated={refreshClient}
                onDeleted={leaveAfterDelete}
              />
            ),
          },
          {
            key: 'custom-sso',
            label: 'Custom SSO',
            children: (
              <CustomSsoSettings
                key={`custom-sso-${discardRevision['custom-sso']}`}
                client={client}
                onDirtyChange={setCustomSsoDirty}
                onCommitted={handleCommitted}
                onMutated={refreshClient}
                onOneTimeSecretPendingChange={setCustomSsoOneTimeSecretPending}
              />
            ),
          },
          {
            key: 'oidc',
            label: 'OIDC',
            children: (
              <OidcSettings
                key={`oidc-${discardRevision.oidc}`}
                client={client}
                onDirtyChange={setOidcDirty}
                onCommitted={handleCommitted}
                onMutated={refreshClient}
                onOneTimeSecretPendingChange={setOidcOneTimeSecretPending}
              />
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
