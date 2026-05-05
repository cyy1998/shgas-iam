import { fetchAuthenticationConfig } from '@sso/lib/sso';
import type { AuthConfig } from '@sso/types/api';

type InitialState = {
  authConfig?: AuthConfig | null;
};

export async function getInitialState(): Promise<InitialState> {
  const authConfig = await fetchAuthenticationConfig();
  return { authConfig };
}
