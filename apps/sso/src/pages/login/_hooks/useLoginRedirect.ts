import { buildAuthorizeUrl } from '@sso/lib/sso';
import { decodeRedirect, getQuery } from '@sso/utils/url';
import { useModel } from '@umijs/max';
import { message } from 'antd';
import { useCallback } from 'react';

export function useLoginRedirect() {
  const { authConfig } = useModel('sso');
  const client = getQuery('client');
  const oidcReturn = getQuery('oidcReturn') ?? '';
  const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';
  const clientLabel = oidcReturn
    ? 'OIDC'
    : client === 'iam-admin'
      ? 'IAM Admin'
      : client || 'SSO';
  const isUnsafeEntry = !client && !oidcReturn;

  const redirectAfterLogin = useCallback(() => {
    if (oidcReturn) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(oidcReturn)) {
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
