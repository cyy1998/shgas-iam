import type { Redis } from "ioredis";
import type { IncomingMessage } from "node:http";
import type { UnknownObject } from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcAccountRepository } from "../repositories/account.repository.ts";
import { readGlobalSession, renewGlobalSession } from "@iam/api-core/session";
import { ClientManagementLevel } from "@iam/contracts";
import { z } from "zod";

const GlobalSessionUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
}).passthrough();

const LocalSessionReferenceSchema = z.object({
  clientCode: z.string().min(1),
  localSessionId: z.string().min(1),
  mode: z.enum(ClientManagementLevel),
});

export type ResolvedGlobalSession = {
  sessionId: string;
  authTime: number;
  userId: number;
  accountId: string;
};

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

export class GlobalSessionResolver {
  constructor(
    private readonly redis: Redis,
    private readonly accounts: OidcAccountRepository,
    private readonly env: OidcProviderEnv,
  ) {}

  async resolve(request: Pick<IncomingMessage, "headers">): Promise<ResolvedGlobalSession | null> {
    const sessionId = getCookieValue(request.headers.cookie, this.env.OIDC_GLOBAL_SESSION_COOKIE);
    if (!sessionId)
      return null;
    return await this.resolveById(sessionId);
  }

  async resolveById(sessionId: string): Promise<ResolvedGlobalSession | null> {
    const envelope = await readGlobalSession(this.redis, sessionId, GlobalSessionUserSchema);
    if (!envelope)
      return null;
    const account = await this.accounts.findById(envelope.user.id);
    if (!account)
      return null;
    return {
      sessionId,
      authTime: envelope.authTime,
      userId: account.id,
      accountId: account.oidcSubject,
    };
  }

  async renew(sessionId: string) {
    return await renewGlobalSession(
      this.redis,
      sessionId,
      this.env.OIDC_GLOBAL_SESSION_TTL_SECONDS,
      LocalSessionReferenceSchema,
    );
  }
}
