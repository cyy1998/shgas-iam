import type { OidcAccountDto } from "@iam/domain/user";
import type { IncomingMessage } from "node:http";
import type { UnknownObject } from "oidc-provider";

export type ResolvedGlobalSession = {
  sessionId: string;
  externalToken?: string;
  authTime: number;
  userId: number;
  accountId: string;
};

export type GlobalSessionEnvelopeUser = {
  id: number;
  username: string;
};

export type GlobalSessionEnvelope = {
  authTime: number;
  user: GlobalSessionEnvelopeUser;
};

export interface GlobalSessionAccountReader {
  findById: (id: number) => Promise<OidcAccountDto | null>;
}

export interface GlobalSessionStore {
  read: (sessionId: string) => Promise<GlobalSessionEnvelope | null>;
  renew: (sessionId: string) => Promise<boolean>;
}

export interface CreateGlobalSessionResolverDeps {
  accounts: GlobalSessionAccountReader;
  sessions: GlobalSessionStore;
  cookieName: string;
}

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

export function createGlobalSessionResolver(deps: CreateGlobalSessionResolverDeps) {
  async function resolveById(sessionId: string): Promise<ResolvedGlobalSession | null> {
    const envelope = await deps.sessions.read(sessionId);
    if (!envelope)
      return null;
    const account = await deps.accounts.findById(envelope.user.id);
    if (!account)
      return null;
    return {
      sessionId,
      authTime: envelope.authTime,
      userId: account.id,
      accountId: account.oidcSubject,
    };
  }

  return {
    async resolve(request: Pick<IncomingMessage, "headers">): Promise<ResolvedGlobalSession | null> {
      const sessionId = getCookieValue(request.headers.cookie, deps.cookieName);
      if (!sessionId)
        return null;
      return await resolveById(sessionId);
    },
    resolveById,
    renew: deps.sessions.renew,
  };
}

export type GlobalSessionResolver = ReturnType<typeof createGlobalSessionResolver>;
