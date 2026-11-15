import type { LoginPageGuardResult } from "@iam/contracts";
import { UNAUTHORIZED } from "@iam/contracts/http";

export type LoginPageGuardOutcome = "continue" | "login" | "wechat_qr" | "invalid_request" | "unavailable";

function isDecision(value: unknown): value is LoginPageGuardResult["decision"] {
  return value === "continue" || value === "login";
}

async function getJson(url: string, signal?: AbortSignal): Promise<{ body: unknown; status: number }> {
  const response = await fetch(url, { credentials: "include", signal });
  return {
    body: await response.json().catch(() => null),
    status: response.status,
  };
}

function getProperty(value: unknown, property: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, property);
}

function parseDecision(value: unknown): LoginPageGuardOutcome {
  const decision = getProperty(value, "decision");
  if (decision === "login" && getProperty(value, "wechatQr") === true) return "wechat_qr";
  return isDecision(decision) ? decision : "unavailable";
}

function classifyErrorStatus(status: number): LoginPageGuardOutcome {
  if (status === UNAUTHORIZED) return "login";
  if (status >= 400 && status < 500) return "invalid_request";
  return "unavailable";
}

export async function checkCustomSsoLoginPageGuard(
  input: {
    client: string;
    redirectUrl: string;
    state?: string;
    ssoReturn?: string;
  },
  signal?: AbortSignal,
): Promise<LoginPageGuardOutcome> {
  const query = new URLSearchParams({
    client: input.client,
    redirectUrl: input.redirectUrl,
  });
  if (input.state !== undefined) query.set("state", input.state);
  if (input.ssoReturn !== undefined) query.set("ssoReturn", input.ssoReturn);
  const response = await getJson(`/sso/login-guard?${query}`, signal);
  if (response.status < 200 || response.status >= 300) return classifyErrorStatus(response.status);
  return parseDecision(getProperty(response.body, "data"));
}

export async function checkOidcLoginPageGuard(
  oidcReturn: string,
  signal?: AbortSignal,
): Promise<LoginPageGuardOutcome> {
  const query = new URLSearchParams({ oidcReturn });
  const response = await getJson(`/oidc/login-guard?${query}`, signal);
  if (response.status < 200 || response.status >= 300) return classifyErrorStatus(response.status);
  return parseDecision(response.body);
}
