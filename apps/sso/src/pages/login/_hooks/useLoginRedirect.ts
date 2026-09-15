import { buildAuthorizeUrl } from '@sso/lib/sso';
import { clientStatus } from '@sso/services/open';
import { getQuery } from '@sso/utils/url';
import { useModel } from '@umijs/max';
import { message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { isValidOidcReturnHandle } from './oidc-return';

export function useLoginRedirect() {
  const { authConfig } = useModel('sso');
  const client = getQuery('client');
  const oidcReturn = getQuery('oidcReturn') ?? '';
  const redirectUrl = getQuery('redirectUrl') ?? '';
  const state = getQuery('state') ?? undefined;
  const ssoReturn = getQuery('ssoReturn') ?? undefined;
  const fallbackClientLabel = oidcReturn
    ? 'OIDC'
    : client === 'iam-admin'
      ? 'IAM Admin'
      : client || 'SSO';
  const [resolvedClient, setResolvedClient] = useState<{
    code: string;
    label: string;
  }>();
  const clientLabel =
    !oidcReturn && resolvedClient?.code === client
      ? resolvedClient.label
      : fallbackClientLabel;
  const isUnsafeEntry = !client && !oidcReturn;

  useEffect(() => {
    if (!client || oidcReturn) return;

    let ignored = false;
    void clientStatus({ clientCode: client })
      .then((data) => {
        const clientName = data?.clientName?.trim();
        if (!ignored && clientName) {
          setResolvedClient({ code: client, label: clientName });
        }
      })
      .catch(() => {});

    return () => {
      ignored = true;
    };
  }, [client, oidcReturn]);

  const redirectAfterLogin = useCallback(() => {
    if (oidcReturn) {
      if (!isValidOidcReturnHandle(oidcReturn)) {
        message.error('OIDC 登录请求已失效，请返回应用重新发起登录');
        return;
      }
      window.location.replace(
        `/oidc/resume?oidcReturn=${encodeURIComponent(oidcReturn)}`,
      );
      return;
    }
    if (!authConfig || !client) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    const authorizeUrl = new URL(
      buildAuthorizeUrl(authConfig, redirectUrl, client, state),
      window.location.origin,
    );
    if (ssoReturn !== undefined)
      authorizeUrl.searchParams.set('ssoReturn', ssoReturn);
    window.location.replace(authorizeUrl.href);
  }, [authConfig, client, oidcReturn, redirectUrl, state, ssoReturn]);

  return {
    client,
    oidcReturn,
    redirectUrl,
    state,
    ssoReturn,
    clientLabel,
    isUnsafeEntry,
    isContinuationReady: Boolean(oidcReturn || (authConfig && client)),
    redirectAfterLogin,
  };
}
