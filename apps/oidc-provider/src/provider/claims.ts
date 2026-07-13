import type {
  AccessToken,
  AccountClaims,
  AuthorizationCode,
  BackchannelAuthenticationRequest,
  DeviceCode,
  UnknownObject,
} from "oidc-provider";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import type {
  ClaimsAccountReader,
  ClaimsAuthorizationReader,
  ClaimsClientRuntimeReader,
  ClaimsProviderSessionBindingStore,
  ClaimsSessionResolver,
  ClaimsTokenRevoker,
} from "./claims.port.ts";

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
  kernelCredentialId?: string;
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
  if (extra.kernelCredentialId !== undefined && typeof extra.kernelCredentialId !== "string")
    return null;
  return extra as OidcAccessTokenExtra;
}

export interface CreateOidcClaimsAdapterDeps {
  accounts: ClaimsAccountReader;
  authorization: ClaimsAuthorizationReader;
  clients: ClaimsClientRuntimeReader;
  providerSessions: ClaimsProviderSessionBindingStore;
  globalSessions: ClaimsSessionResolver;
  tokens: ClaimsTokenRevoker;
}

export function createOidcClaimsAdapter(deps: CreateOidcClaimsAdapterDeps) {
  async function buildSnapshot(subject: string, clientId: string, scopes: string[]) {
    const [account, client] = await Promise.all([
      deps.accounts.findBySubject(subject),
      deps.clients.findRuntime(clientId),
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
      snapshot["iam:authorization"] = await deps.authorization.buildClaim(account.id, client.iam_client_id);
    return { account, client, snapshot };
  }

  async function validateBinding(
    sessionUid: string,
    expected: Pick<OidcAccessTokenExtra, "userId" | "globalSessionId">,
  ) {
    const binding = await deps.providerSessions.read(sessionUid);
    if (!binding
      || binding.userId !== expected.userId
      || binding.globalSessionId !== expected.globalSessionId) {
      return null;
    }
    const session = await deps.globalSessions.resolveById(binding.globalSessionId);
    if (!session
      || session.userId !== binding.userId
      || session.accountId !== binding.accountId
      || session.authTime !== binding.authTime) {
      return null;
    }
    return binding;
  }

  return {
    async createAccessTokenExtra(token: AccessToken): Promise<OidcAccessTokenExtra | undefined> {
      if (!token.accountId || !token.clientId || !token.sessionUid)
        return undefined;
      const binding = await deps.providerSessions.read(token.sessionUid);
      if (!binding || binding.accountId !== token.accountId)
        return undefined;
      const built = await buildSnapshot(token.accountId, token.clientId, tokenScopes(token));
      if (!built || built.account.id !== binding.userId)
        return undefined;
      const session = await deps.globalSessions.resolveById(binding.globalSessionId);
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
    },

    async findAccount(subject: string, token?: FindAccountToken) {
      const account = await deps.accounts.findBySubject(subject);
      if (!account)
        return undefined;

      let claims: OidcUserInfoSnapshot = {
        sub: account.oidcSubject,
        name: account.name,
        preferred_username: account.username,
        ...(account.mobile ? { phone_number: account.mobile } : {}),
      };
      if (token?.kind === "AccessToken") {
        const credential = token.jti
          ? await deps.tokens.resolveAccessTokenCredential(token.jti)
          : null;
        if (!credential)
          return undefined;
        const extra = tokenExtra(token);
        const client = token.clientId ? await deps.clients.findRuntime(token.clientId) : null;
        const validBinding = extra && token.sessionUid
          ? await validateBinding(token.sessionUid, extra)
          : null;
        if (!extra
          || !client
          || credential.credential.credentialId !== extra.kernelCredentialId
          || credential.credential.principalSessionId !== extra.globalSessionId
          || credential.credential.bindingId !== validBinding?.bindingId
          || credential.credential.clientCode !== token.clientId
          || client.oidc_config_version !== extra.oidcConfigVersion
          || credential.metadata.oidcConfigVersion !== extra.oidcConfigVersion
          || account.id !== extra.userId
          || account.oidcSubject !== extra.userInfoSnapshot.sub
          || !validBinding) {
          await deps.tokens.revokeAccessTokenCredential(credential.credential.credentialId);
          return undefined;
        }
        claims = extra.userInfoSnapshot;
      }
      else if (token?.kind === "AuthorizationCode" && token.clientId) {
        const built = await buildSnapshot(subject, token.clientId, tokenScopes(token));
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
    },

    readBinding(sessionUid: string): Promise<ProviderSessionBinding | null> {
      return deps.providerSessions.read(sessionUid);
    },
  };
}

export type OidcClaimsAdapter = ReturnType<typeof createOidcClaimsAdapter>;
