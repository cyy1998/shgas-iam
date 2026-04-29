import { fetchAuthenticationConfig } from '@/lib/sso';
import { getCurrentUserInfo } from '@/services/public';
import type { AuthConfig, UserInfo } from '@/types/api';
import { useCallback, useEffect, useState } from 'react';

export default function useSsoModel() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const loadAuthConfig = useCallback(async () => {
    const cfg = await fetchAuthenticationConfig();
    if (cfg) setAuthConfig(cfg);
  }, []);

  const loadUserInfo = useCallback(async () => {
    try {
      const info = await getCurrentUserInfo();
      setUserInfo(info);
      return info;
    } catch {
      setUserInfo(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void loadAuthConfig();
  }, [loadAuthConfig]);

  return {
    authConfig,
    userInfo,
    setUserInfo,
    loadAuthConfig,
    loadUserInfo,
  };
}
