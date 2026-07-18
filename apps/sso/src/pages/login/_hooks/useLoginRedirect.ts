import { buildAuthorizeUrl } from '@sso/lib/sso';
import { clientStatus } from '@sso/services/open';
import { decodeRedirect, getQuery } from '@sso/utils/url';
import { useModel } from '@umijs/max';
import { message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

export function useLoginRedirect() {
  const { authConfig } = useModel('sso');
  const client = getQuery('client');
  const oidcReturn = getQuery('oidcReturn') ?? '';
  const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';
  const fallbackClientLabel = oidcReturn
    ? 'OIDC'
    : client === 'iam-admin'
      ? 'IAM Admin'
      : client || 'SSO';
  const [clientLabel, setClientLabel] = useState(fallbackClientLabel);
  const isUnsafeEntry = !client && !oidcReturn;

  useEffect(() => {
    setClientLabel(fallbackClientLabel);
    if (!client || oidcReturn) return;

    let ignored = false;
    void clientStatus({ clientCode: client })
      .then((data) => {
        const clientName = data?.clientName?.trim();
        if (!ignored && clientName) setClientLabel(clientName);
      })
      .catch(() => {});

    return () => {
      ignored = true;
    };
  }, [client, fallbackClientLabel, oidcReturn]);

  const redirectAfterLogin = useCallback(() => {
    if (oidcReturn) {
      if (!/^[\w-]{43}$/.test(oidcReturn)) {
        message.error('OIDC 登录请求已失效，请返回应用重新发起登录');
        return;
      }
      window.location.href = `/oidc/resume?oidcReturn=${encodeURIComponent(oidcReturn)}`;
      return;
    }
    if (!authConfig || !client) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildAuthorizeUrl(authConfig, redirectUrl, client);
  }, [authConfig, client, oidcReturn, redirectUrl]);

  return {
    client,
    oidcReturn,
    redirectUrl,
    clientLabel,
    isUnsafeEntry,
    redirectAfterLogin,
  };
}
