import { fetchAuthenticationConfig } from '@/lib/sso';
import type { AuthConfig } from '@/types/api';

type InitialState = {
  authConfig?: AuthConfig | null;
};

export async function getInitialState(): Promise<InitialState> {
  const authConfig = await fetchAuthenticationConfig();
  return { authConfig };
}
