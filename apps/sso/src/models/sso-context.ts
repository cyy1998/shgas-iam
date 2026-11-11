import { createContext, useContext } from "react";
import type { SsoState } from "./sso";

export const SsoContext = createContext<SsoState | null>(null);

export function useSso(): SsoState {
  const sso = useContext(SsoContext);
  if (!sso) throw new Error("SSO provider missing");
  return sso;
}
