import { StyleProvider } from '@ant-design/cssinjs';
import { fetchAuthenticationConfig } from '@sso/lib/sso';
import type { AuthConfig } from '@sso/types/api';
import { restoreLoginRedirectState } from '@sso/utils/url';
import { createElement, type ReactNode } from 'react';

type InitialState = {
  authConfig?: AuthConfig | null;
};

if (typeof window !== 'undefined') {
  restoreLoginRedirectState();
}

export async function getInitialState(): Promise<InitialState> {
  const authConfig = await fetchAuthenticationConfig();
  return { authConfig };
}

export function rootContainer(container: ReactNode) {
  return createElement(StyleProvider, { hashPriority: 'high' }, container);
}
