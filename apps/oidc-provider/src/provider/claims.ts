import type { Redis } from "ioredis";
import type {
  AccessToken,
  AccountClaims,
  AuthorizationCode,
  BackchannelAuthenticationRequest,
  DeviceCode,
  UnknownObject,
} from "oidc-provider";
import type { GlobalSessionResolver } from "../interaction/global-session.ts";
import type { OidcAccountRepository } from "../repositories/account.repository.ts";
import type { OidcAuthorizationRepository } from "../repositories/authorization.repository.ts";
import type { OidcClientRepository } from "../repositories/client.repository.ts";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import { revokeOidcAccessToken } from "@iam/api-core/oidc";
import { readProviderSessionBinding } from "../session/provider-session.ts";

type ProtocolToken = AuthorizationCode | AccessToken;
type FindAccountToken = ProtocolToken | DeviceCode | BackchannelAuthenticationRequest;

export type OidcUserInfoSnapshot = UnknownObject & {
  sub: string;
};

export type OidcAccessTokenExtra = UnknownObject & {
  userId: number;
  globalSessionId: string;
  authTime: number;
  scopes: string[];
  oidcConfigVersion: number;
  userInfoSnapshot: OidcUserInfoSnapshot;
};

function tokenScopes(token: ProtocolToken) {
  if (typeof token.scope === "string")
    return token.scope.split(" ").filter(Boolean);
  return [...token.scopes];
}

function tokenExtra(token: AccessToken): OidcAccessTokenExtra | null {
  const extra = token.extra as Partial<OidcAccessTokenExtra> | undefined;
  if (!extra
    || typeof extra.userId !== "number"
    || typeof extra.globalSessionId !== "string"
    || typeof extra.authTime !== "number"
    || !Array.isArray(extra.scopes)
    || typeof extra.oidcConfigVersion !== "number"
    || !extra.userInfoSnapshot
    || typeof extra.userInfoSnapshot.sub !== "string") {
    return null;
  }
  return extra as OidcAccessTokenExtra;
}

export class OidcClaimsService {
  constructor(
    private readonly redis: Redis,
    private readonly accounts: OidcAccountRepository,
    private readonly authorization: OidcAuthorizationRepository,
    private readonly clients: OidcClientRepository,
    private readonly globalSessions: GlobalSessionResolver,
  ) {}

  private async buildSnapshot(subject: string, clientId: string, scopes: string[]) {
    const [account, client] = await Promise.all([
      this.accounts.findBySubject(subject),
      this.clients.findRuntime(clientId),
    ]);
    if (!account || !client)
      return null;
    const snapshot: OidcUserInfoSnapshot = { sub: account.oidcSubject };
    if (scopes.includes("profile")) {
      snapshot.name = account.name;
      snapshot.preferred_username = account.username;
    }
    if (scopes.includes("phone") && account.mobile)
      snapshot.phone_number = account.mobile;
    if (scopes.includes("iam:authorization"))
      snapshot["iam:authorization"] = await this.authorization.buildClaim(account.id, client.iam_client_id);
    return { account, client, snapshot };
  }

  private async validateBinding(sessionUid: string, expected: Pick<OidcAccessTokenExtra, "userId" | "globalSessionId">) {
    const binding = await readProviderSessionBinding(this.redis, sessionUid);
    if (!binding
      || binding.userId !== expected.userId
      || binding.globalSessionId !== expected.globalSessionId) {
      return null;
    }
    const session = await this.globalSessions.resolveById(binding.globalSessionId);
    if (!session
      || session.userId !== binding.userId
      || session.accountId !== binding.accountId
      || session.authTime !== binding.authTime) {
      return null;
    }
    return binding;
  }

  async createAccessTokenExtra(token: AccessToken): Promise<OidcAccessTokenExtra | undefined> {
    if (!token.accountId || !token.clientId || !token.sessionUid)
      return undefined;
    const binding = await readProviderSessionBinding(this.redis, token.sessionUid);
    if (!binding || binding.accountId !== token.accountId)
      return undefined;
    const built = await this.buildSnapshot(token.accountId, token.clientId, tokenScopes(token));
    if (!built || built.account.id !== binding.userId)
      return undefined;
    const session = await this.globalSessions.resolveById(binding.globalSessionId);
    if (!session || session.accountId !== token.accountId || session.authTime !== binding.authTime)
      return undefined;
    return {
      userId: binding.userId,
      globalSessionId: binding.globalSessionId,
      authTime: binding.authTime,
      scopes: tokenScopes(token),
      oidcConfigVersion: built.client.oidc_config_version,
      userInfoSnapshot: built.snapshot,
    };
  }

  async findAccount(subject: string, token?: FindAccountToken) {
    const account = await this.accounts.findBySubject(subject);
    if (!account)
      return undefined;

    let claims: OidcUserInfoSnapshot = {
      sub: account.oidcSubject,
      name: account.name,
      preferred_username: account.username,
      ...(account.mobile ? { phone_number: account.mobile } : {}),
    };
    if (token?.kind === "AccessToken") {
      const extra = tokenExtra(token);
      const client = token.clientId ? await this.clients.findRuntime(token.clientId) : null;
      const validBinding = extra && token.sessionUid
        ? await this.validateBinding(token.sessionUid, extra)
        : null;
      if (!extra
        || !client
        || client.oidc_config_version !== extra.oidcConfigVersion
        || account.id !== extra.userId
        || account.oidcSubject !== extra.userInfoSnapshot.sub
        || !validBinding) {
        if (token.jti)
          await revokeOidcAccessToken(this.redis, `oidc:model:AccessToken:${token.jti}`);
        return undefined;
      }
      claims = extra.userInfoSnapshot;
    }
    else if (token?.kind === "AuthorizationCode" && token.clientId) {
      const built = await this.buildSnapshot(subject, token.clientId, tokenScopes(token));
      if (!built)
        return undefined;
      claims = built.snapshot;
    }
    const tokenAuthTime = token?.kind === "AuthorizationCode" ? token.authTime : undefined;

    return {
      accountId: account.oidcSubject,
      claims: async (use: string): Promise<AccountClaims> => {
        if (use !== "id_token")
          return claims;
        const { "iam:authorization": _authorization, ...idTokenClaims } = claims;
        return {
          ...idTokenClaims,
          sub: account.oidcSubject,
          ...(typeof tokenAuthTime === "number" ? { auth_time: tokenAuthTime } : {}),
        };
      },
    };
  }

  async readBinding(sessionUid: string): Promise<ProviderSessionBinding | null> {
    return await readProviderSessionBinding(this.redis, sessionUid);
  }
}
