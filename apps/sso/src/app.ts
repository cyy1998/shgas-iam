import { fetchAuthenticationConfig } from '@/lib/sso';
import { getCurrentUserInfo } from '@/services/public';
import type { AuthConfig, UserInfo } from '@/types/api';

type InitialState = {
  authConfig?: AuthConfig | null;
  userInfo?: UserInfo | null;
};

export async function getInitialState(): Promise<InitialState> {
  const [authConfig, userInfo] = await Promise.all([
    fetchAuthenticationConfig(),
    getCurrentUserInfo().catch(() => null),
  ]);
  return { authConfig, userInfo };
}
