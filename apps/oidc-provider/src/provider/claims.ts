import type {
  ClientAuthorizationEmployment,
  EmploymentProfile,
  OptionalSubjectClaim,
  SubjectClaimSelection,
} from "@iam/client-subject-projection";
import type {
  AccessToken,
  AccountClaims,
  AuthorizationCode,
  BackchannelAuthenticationRequest,
  DeviceCode,
  UnknownObject,
} from "oidc-provider";
import type {
  CreateOidcAuthorizationCodeSnapshotInput,
  OidcClaimsSnapshot,
  OidcUserInfoSnapshot,
} from "./claims-snapshot.ts";
import type {
  ClaimsAccountReader,
  ClaimsClientRuntimeReader,
  ClaimsProviderSessionBindingStore,
  ClaimsSessionResolver,
  ClaimsSubjectProjectionResolver,
  ClaimsTokenRevoker,
} from "./claims.port.ts";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { OidcScope } from "@iam/contracts";
import { errors } from "oidc-provider";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
import { parseOidcClaimsSnapshot } from "./claims-snapshot.ts";

type ProtocolToken = AuthorizationCode | AccessToken;
type FindAccountToken = ProtocolToken | DeviceCode | BackchannelAuthenticationRequest;

export type OidcAccessTokenExtra = UnknownObject & {
  claimsSnapshot: OidcClaimsSnapshot;
  kernelCredentialId?: string;
};

function claimsSnapshotFromCode(code: AuthorizationCode): OidcClaimsSnapshot | null {
  return parseOidcClaimsSnapshot(
    (code as AuthorizationCode & { claimsSnapshot?: unknown }).claimsSnapshot,
  );
}

function snapshotAccessTokenExtra(token: AccessToken): OidcAccessTokenExtra | null {
  const extra = token.extra as Partial<OidcAccessTokenExtra> | undefined;
  const claimsSnapshot = parseOidcClaimsSnapshot(extra?.claimsSnapshot);
  if (!claimsSnapshot
    || (extra?.kernelCredentialId !== undefined && typeof extra.kernelCredentialId !== "string")) {
    return null;
  }
  return {
    claimsSnapshot,
    ...(extra?.kernelCredentialId ? { kernelCredentialId: extra.kernelCredentialId } : {}),
  };
}

function sameScopes(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every(scope => right.includes(scope));
}

function matchesSnapshotProtocolContext(
  snapshot: OidcClaimsSnapshot,
  token: ProtocolToken,
  expectedSubjectIdentifier = token.accountId,
) {
  const tokenScopes = normalizeOidcProtocolScopes(token);
  return expectedSubjectIdentifier === snapshot.subjectIdentifier
    && token.accountId === snapshot.subjectIdentifier
    && token.clientId === snapshot.clientId
    && token.sessionUid === snapshot.providerSessionUid
    && tokenScopes !== null
    && sameScopes(snapshot.scopes, tokenScopes);
}

export interface CreateOidcClaimsAdapterDeps {
  accounts: ClaimsAccountReader;
  clients: ClaimsClientRuntimeReader;
  providerSessions: ClaimsProviderSessionBindingStore;
  globalSessions: ClaimsSessionResolver;
  projection: ClaimsSubjectProjectionResolver;
  tokens: ClaimsTokenRevoker;
}

function selectionFromScopes(scopes: readonly OidcScope[]): SubjectClaimSelection {
  const authorizedScopes = new Set(scopes);
  const optionalClaims: OptionalSubjectClaim[] = [];
  if (authorizedScopes.has(OidcScope.Profile))
    optionalClaims.push("profile:username", "profile:name");
  if (authorizedScopes.has(OidcScope.Phone))
    optionalClaims.push("profile:phone");
  if (authorizedScopes.has(OidcScope.IamEmployments))
    optionalClaims.push("profile:employments");
  if (authorizedScopes.has(OidcScope.IamAuthorization))
    optionalClaims.push("iam:authorization");
  return { catalogVersion: 1, optionalClaims };
}

function toOidcEmployment(employment: EmploymentProfile) {
  return {
    isPrimary: employment.isPrimary,
    organization: {
      orgCode: employment.organization.code,
      orgName: employment.organization.name,
      orgType: employment.organization.type,
      fullOrgPath: employment.organization.path.map(organization => ({
        orgCode: organization.code,
        orgName: organization.name,
        orgType: organization.type,
      })),
    },
    position: {
      posCode: employment.position.code,
      posName: employment.position.name,
    },
  };
}

function toOidcAuthorizationEmployment(employment: ClientAuthorizationEmployment) {
  return {
    ...toOidcEmployment(employment),
    roles: [...employment.roles],
    privileges: [...employment.privileges],
  };
}

export function createOidcClaimsAdapter(deps: CreateOidcClaimsAdapterDeps) {
  async function validateSnapshotBinding(snapshot: OidcClaimsSnapshot) {
    const binding = await deps.providerSessions.read(snapshot.providerSessionUid, snapshot.clientId);
    if (!binding
      || binding.clientCode !== snapshot.clientId
      || binding.accountId !== snapshot.subjectIdentifier
      || binding.principalSessionId !== snapshot.principalSessionId
      || binding.bindingId !== snapshot.providerSessionBindingId
      || binding.oidcConfigVersion !== snapshot.oidcConfigVersion) {
      return null;
    }
    const session = await deps.globalSessions.resolveById(snapshot.principalSessionId);
    if (!session
      || session.sessionId !== snapshot.principalSessionId
      || session.accountId !== snapshot.subjectIdentifier
      || session.authTime !== binding.authTime) {
      return null;
    }
    return binding;
  }

  function resolvedAccount(
    subjectIdentifier: string,
    claims: OidcUserInfoSnapshot,
    tokenAuthTime?: number,
  ) {
    return {
      accountId: subjectIdentifier,
      claims: async (use: string): Promise<AccountClaims> => {
        if (use !== "id_token")
          return claims;
        const {
          [OidcScope.IamAuthorization]: _authorization,
          [OidcScope.IamEmployments]: _employments,
          ...idTokenClaims
        } = claims;
        return {
          ...idTokenClaims,
          sub: subjectIdentifier,
          ...(typeof tokenAuthTime === "number" ? { auth_time: tokenAuthTime } : {}),
        };
      },
    };
  }

  return {
    async createAuthorizationCodeSnapshot(
      input: CreateOidcAuthorizationCodeSnapshotInput,
    ): Promise<OidcClaimsSnapshot> {
      const selection = selectionFromScopes(input.scopes);
      const projection = await deps.projection.resolve({
        subjectIdentifier: input.subjectIdentifier,
        clientCode: input.clientId,
        selection,
      }).catch((error: unknown) => {
        if (error instanceof SubjectProjectionNotReadyError)
          throw new errors.TemporarilyUnavailable();
        throw error;
      });
      const claimsSnapshot = {
        version: 1,
        subjectIdentifier: input.subjectIdentifier,
        clientId: input.clientId,
        scopes: [...input.scopes],
        oidcConfigVersion: input.oidcConfigVersion,
        providerSessionUid: input.providerSessionUid,
        principalSessionId: input.principalSessionId,
        providerSessionBindingId: input.providerSessionBindingId,
        claims: {
          sub: projection.subjectIdentifier,
          ...(input.scopes.includes(OidcScope.Profile) && projection.username !== undefined
            ? { preferred_username: projection.username }
            : {}),
          ...(input.scopes.includes(OidcScope.Profile) && projection.name !== undefined
            ? { name: projection.name }
            : {}),
          ...(input.scopes.includes(OidcScope.Phone) && projection.phone
            ? { phone_number: projection.phone }
            : {}),
          ...(input.scopes.includes(OidcScope.IamEmployments) && projection.employments !== undefined
            ? { [OidcScope.IamEmployments]: projection.employments.map(toOidcEmployment) }
            : {}),
          ...(input.scopes.includes(OidcScope.IamAuthorization) && projection.authorization !== undefined
            ? {
                [OidcScope.IamAuthorization]: {
                  employments: projection.authorization.employments.map(toOidcAuthorizationEmployment),
                  roles: [...projection.authorization.roles],
                  privileges: [...projection.authorization.privileges],
                },
              }
            : {}),
        },
      };
      const parsed = parseOidcClaimsSnapshot(claimsSnapshot);
      if (!parsed)
        throw new Error("OIDC Claims Snapshot construction failed validation");
      return parsed;
    },

    async createAccessTokenExtra(
      token: AccessToken,
      code?: AuthorizationCode,
    ): Promise<OidcAccessTokenExtra | undefined> {
      if (!code)
        return undefined;
      const snapshot = claimsSnapshotFromCode(code);
      if (!snapshot || !matchesSnapshotProtocolContext(snapshot, token)) {
        return undefined;
      }
      return { claimsSnapshot: snapshot };
    },

    async findAccount(subject: string, token?: FindAccountToken) {
      if (token?.kind === "AuthorizationCode") {
        const snapshot = claimsSnapshotFromCode(token);
        if (!snapshot)
          return undefined;
        if (!matchesSnapshotProtocolContext(snapshot, token, subject)) {
          return undefined;
        }
        return resolvedAccount(snapshot.subjectIdentifier, snapshot.claims, token.authTime);
      }

      if (token?.kind === "AccessToken") {
        const extra = snapshotAccessTokenExtra(token);
        if (!extra)
          return undefined;
        const snapshot = extra.claimsSnapshot;
        const credential = token.jti
          ? await deps.tokens.resolveAccessTokenCredential(token.jti)
          : null;
        if (!credential)
          return undefined;
        const [client, validBinding] = await Promise.all([
          deps.clients.findRuntime(snapshot.clientId),
          validateSnapshotBinding(snapshot),
        ]);
        if (!client
          || !matchesSnapshotProtocolContext(snapshot, token, subject)
          || credential.credential.credentialId !== extra.kernelCredentialId
          || credential.credential.principalSessionId !== snapshot.principalSessionId
          || credential.credential.bindingId !== snapshot.providerSessionBindingId
          || credential.credential.clientCode !== snapshot.clientId
          || credential.metadata.oidcConfigVersion !== snapshot.oidcConfigVersion
          || client.oidc_config_version !== snapshot.oidcConfigVersion
          || !validBinding) {
          await deps.tokens.revokeAccessTokenCredential(credential.credential.credentialId);
          return undefined;
        }
        return resolvedAccount(snapshot.subjectIdentifier, snapshot.claims);
      }

      const account = await deps.accounts.findBySubject(subject);
      if (!account)
        return undefined;

      const claims: OidcUserInfoSnapshot = {
        sub: account.subjectIdentifier,
        name: account.name,
        preferred_username: account.username,
        ...(account.mobile ? { phone_number: account.mobile } : {}),
      };
      return resolvedAccount(account.subjectIdentifier, claims);
    },
  };
}

export type OidcClaimsAdapter = ReturnType<typeof createOidcClaimsAdapter>;
