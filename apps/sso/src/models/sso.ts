import { fetchAuthenticationConfig } from "@sso/services/authentication-config";
import { getCurrentUserInfo } from "@sso/services/public";
import type { AuthConfig, UserInfo } from "@sso/types/api";
import { useCallback, useEffect, useState } from "react";

export default function useSsoModel() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authConfigStatus, setAuthConfigStatus] = useState<"loading" | "success" | "error">("loading");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userInfoStatus, setUserInfoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const loadAuthConfig = useCallback(async () => {
    setAuthConfigStatus("loading");
    const cfg = await fetchAuthenticationConfig();
    setAuthConfig(cfg);
    setAuthConfigStatus(cfg ? "success" : "error");
  }, []);

  const loadUserInfo = useCallback(async () => {
    setUserInfoStatus("loading");
    try {
      const info = await getCurrentUserInfo();
      setUserInfo(info);
      setUserInfoStatus("success");
    } catch {
      setUserInfoStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadAuthConfig();
  }, [loadAuthConfig]);

  return {
    authConfig,
    authConfigStatus,
    userInfo,
    userInfoStatus,
    setUserInfo,
    loadAuthConfig,
    loadUserInfo,
  };
}
