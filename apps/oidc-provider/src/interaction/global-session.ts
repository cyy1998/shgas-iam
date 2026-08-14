import type { UnknownObject } from "oidc-provider";

export type ResolvedGlobalSession = {
  sessionId: string;
  authTime: number;
  accountId: string;
};

export type GlobalSessionInspection
  = | { status: "absent" }
    | { status: "invalid" }
    | { status: "valid" };

export function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader)
    return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1)
      continue;
    const key = part.slice(0, separator).trim();
    if (key === name)
      return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function requestNeedsReauthentication(
  params: UnknownObject,
  authTime: number,
  now = Math.floor(Date.now() / 1000),
) {
  const prompt = typeof params.prompt === "string" ? params.prompt.split(" ") : [];
  if (prompt.includes("login"))
    return true;
  if (params.max_age === undefined)
    return false;
  const maxAge = Number(params.max_age);
  return Number.isFinite(maxAge) && (maxAge === 0 || now - authTime > maxAge);
}
