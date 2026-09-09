import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type {
  ClientAuthorizationEmployment,
  EmploymentProfile,
  EmploymentProfileBase,
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
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import type {
  OidcUserInfoClaims,
} from "./claims/claims-contract.ts";
import type {
  CreateOidcClaimsAdapterDeps,
} from "./claims/claims.port.ts";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { OidcScope } from "@iam/contracts";
import { errors } from "oidc-provider";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
import * as claimsSnapshotContract from "./claims/claims-snapshot.ts";

type ProtocolToken = AuthorizationCode | AccessToken;
type FindAccountToken
  = | ProtocolToken
    | DeviceCode
    | BackchannelAuthenticationRequest;

export type OidcAccessTokenExtra = UnknownObject & {
  authTime: number;
  claimsSnapshot: claimsSnapshotContract.OidcClaimsSnapshot;
  kernelCredentialId?: string;
};

function claimsSnapshotFromCode(
  code: AuthorizationCode,
): claimsSnapshotContract.OidcClaimsSnapshot | null {
  return claimsSnapshotContract.parseOidcClaimsSnapshot(
    (code as AuthorizationCode & { claimsSnapshot?: unknown }).claimsSnapshot,
  );
}

function snapshotAccessTokenExtra(
  token: AccessToken,
): OidcAccessTokenExtra | null {
  const extra = token.extra as Partial<OidcAccessTokenExtra>
    | undefined;
  const claimsSnapshot = claimsSnapshotContract.parseOidcClaimsSnapshot(
    extra?.claimsSnapshot,
  );
  if (!claimsSnapshot
    || typeof extra?.authTime !== "number" || !Number.isSafeInteger(extra.authTime) || extra.authTime < 0
    || (extra?.kernelCredentialId !== undefined
      && typeof extra.kernelCredentialId !== "string")) {
    return null;
  }
  return {
    authTime: extra.authTime,
    claimsSnapshot,
    ...(extra?.kernelCredentialId
      ? { kernelCredentialId: extra.kernelCredentialId }
      : {}),
  };
}

function sameScopes(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every(scope => right.includes(scope));
}

function matchesSnapshotProtocolContext(
  snapshot: claimsSnapshotContract.OidcClaimsSnapshot,
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

function selectionFromScopes(
  scopes: readonly OidcScope[],
): SubjectClaimSelection {
  const authorizedScopes = new Set(scopes);
  const optionalClaims: SubjectClaimSelection["optionalClaims"][number][] = [];
  if (authorizedScopes.has(OidcScope.Profile))
    optionalClaims.push("profile:username", "profile:name");
  if (authorizedScopes.has(OidcScope.Phone))
    optionalClaims.push("profile:phone");
  if (authorizedScopes.has(OidcScope.IamEmployments))
    optionalClaims.push("profile:employments");
  if (authorizedScopes.has(OidcScope.IamAuthorization))
    optionalClaims.push("iam:authorization");
  return { catalogVersion: 2, optionalClaims };
}

function toOidcEmploymentBase(employment: EmploymentProfileBase) {
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

function toOidcEmployment(
  employment: EmploymentProfile,
) {
  return {
    ...toOidcEmploymentBase(employment),
    responsibilities: employment.responsibilities.map(responsibility => ({
      type: {
        code: responsibility.type.code,
        name: responsibility.type.name,
      },
      targetOrganization: {
        code: responsibility.targetOrganization.code,
        name: responsibility.targetOrganization.name,
        type: responsibility.targetOrganization.type,
        path: responsibility.targetOrganization.path.map(organization => ({
          code: organization.code,
          name: organization.name,
          type: organization.type,
        })),
      },
    })),
  };
}

function toOidcAuthorizationEmployment(
  employment: ClientAuthorizationEmployment,
) {
  return {
    ...toOidcEmploymentBase(employment),
    roles: [...employment.roles],
    privileges: [...employment.privileges],
  };
}

function createOidcClaimsCore(
  deps: CreateOidcClaimsAdapterDeps,
) {
  async function validateSnapshotBinding(
    snapshot: claimsSnapshotContract.OidcClaimsSnapshot,
    authTime: number,
  ) {
    const binding = await deps.providerSessions.readForAccessToken(
      snapshot.providerSessionUid,
      snapshot.clientId,
    );
    if (!binding
      || binding.clientCode !== snapshot.clientId
      || binding.accountId !== snapshot.subjectIdentifier
      || binding.principalSessionId !== snapshot.principalSessionId
      || binding.bindingId !== snapshot.providerSessionBindingId
      || binding.authTime !== authTime
      || binding.oidcConfigVersion !== snapshot.oidcConfigVersion) {
      return null;
    }
    return binding;
  }

  function resolvedAccount(
    resolvedSubjectIdentifier: string,
    claims: OidcUserInfoClaims,
    tokenAuthTime?: number,
  ) {
    return {
      accountId: resolvedSubjectIdentifier,
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
          sub: resolvedSubjectIdentifier,
          ...(typeof tokenAuthTime === "number"
            ? { auth_time: tokenAuthTime }
            : {}),
        };
      },
    };
  }

  return {
    async createAuthorizationCodeSnapshot(
      input: claimsSnapshotContract.CreateOidcAuthorizationCodeSnapshotInput,
    ) {
      const projection = await deps.projection.resolve({
        subjectIdentifier: input.subjectIdentifier,
        clientCode: input.clientId,
        selection: selectionFromScopes(input.scopes),
      }).catch((error: unknown) => {
        if (error instanceof SubjectProjectionNotReadyError)
          throw new errors.TemporarilyUnavailable();
        throw error;
      });
      const snapshot = {
        version: 2,
        claimsContractVersion: 2,
        subjectIdentifier: input.subjectIdentifier,
        clientId: input.clientId,
        scopes: [...input.scopes],
        oidcConfigVersion: input.oidcConfigVersion,
        providerSessionUid: input.providerSessionUid,
        principalSessionId: input.principalSessionId,
        providerSessionBindingId: input.providerSessionBindingId,
        claims: {
          sub: projection.subjectIdentifier,
          ...(input.scopes.includes(OidcScope.Profile)
            && projection.username !== undefined
            ? { preferred_username: projection.username }
            : {}),
          ...(input.scopes.includes(OidcScope.Profile)
            && projection.name !== undefined
            ? { name: projection.name }
            : {}),
          ...(input.scopes.includes(OidcScope.Phone) && projection.phone
            ? { phone_number: projection.phone }
            : {}),
          ...(input.scopes.includes(OidcScope.IamEmployments)
            && projection.employments !== undefined
            ? {
                [OidcScope.IamEmployments]: projection.employments.map(
                  toOidcEmployment,
                ),
              }
            : {}),
          ...(input.scopes.includes(OidcScope.IamAuthorization)
            && projection.authorization !== undefined
            ? {
                [OidcScope.IamAuthorization]: {
                  employments: projection.authorization.employments.map(
                    toOidcAuthorizationEmployment,
                  ),
                  roles: [...projection.authorization.roles],
                  privileges: [...projection.authorization.privileges],
                },
              }
            : {}),
        },
      };
      const parsed = claimsSnapshotContract.parseOidcClaimsSnapshot(snapshot);
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
      if (!snapshot
        || !matchesSnapshotProtocolContext(snapshot, token)) {
        return undefined;
      }
      if (typeof code.authTime !== "number" || !Number.isSafeInteger(code.authTime) || code.authTime < 0)
        return undefined;
      return { claimsSnapshot: snapshot, authTime: code.authTime };
    },

    async findAccount(subject: string, token?: FindAccountToken) {
      if (token?.kind === "AuthorizationCode") {
        const snapshot = claimsSnapshotFromCode(token);
        if (!snapshot
          || !matchesSnapshotProtocolContext(
            snapshot,
            token,
            subject,
          )) {
          return undefined;
        }
        return resolvedAccount(
          snapshot.subjectIdentifier,
          snapshot.claims,
          token.authTime,
        );
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
          validateSnapshotBinding(snapshot, credential.metadata.authTime),
        ]);
        if (!client
          || !matchesSnapshotProtocolContext(
            snapshot,
            token,
            subject,
          )
          || credential.credential.credentialId !== extra.kernelCredentialId
          || credential.credential.principal.subjectId !== snapshot.subjectIdentifier
          || credential.metadata.authTime !== extra.authTime
          || credential.metadata.providerTokenId !== token.jti
          || credential.credential.principalSessionId
          !== snapshot.principalSessionId
          || credential.credential.bindingId
          !== snapshot.providerSessionBindingId
          || credential.credential.clientCode !== snapshot.clientId
          || credential.metadata.oidcConfigVersion
          !== snapshot.oidcConfigVersion
          || client.oidc_config_version !== snapshot.oidcConfigVersion
          || !validBinding) {
          await deps.tokens.revokeAccessTokenCredential(
            credential.credential.credentialId,
          );
          return undefined;
        }
        return resolvedAccount(snapshot.subjectIdentifier, snapshot.claims);
      }

      const account = await deps.accounts.findBySubject(subject);
      if (!account)
        return undefined;
      return resolvedAccount(account.subjectIdentifier, {
        sub: account.subjectIdentifier,
        name: account.name,
        preferred_username: account.username,
        ...(account.mobile ? { phone_number: account.mobile } : {}),
      });
    },
  };
}

export type OidcClaimsAdapter = ReturnType<
  typeof createOidcClaimsAdapter
>;

/** Claims remain capabilities of the operation that resolved them. */
export function createOidcClaimsAdapter(
  deps: CreateOidcClaimsAdapterDeps,
  current: () => SubjectAccessOperation,
  resolveAuthorizationSession: () => Promise<ResolvedGlobalSession | null>,
) {
  const claims = createOidcClaimsCore(deps);
  return {
    async createAuthorizationCodeSnapshot(input: Parameters<typeof claims.createAuthorizationCodeSnapshot>[0]) {
      const operation = current();
      operation.requirePermission(input.subjectIdentifier);
      const snapshot = await claims.createAuthorizationCodeSnapshot(input);
      operation.requirePermission(input.subjectIdentifier);
      return snapshot;
    },
    async createAccessTokenExtra(...args: Parameters<typeof claims.createAccessTokenExtra>) {
      const operation = current();
      operation.requirePermission(args[0].accountId);
      const extra = await claims.createAccessTokenExtra(...args);
      operation.requirePermission(args[0].accountId);
      return extra;
    },
    async findAccount(...args: Parameters<typeof claims.findAccount>) {
      const operation = current();
      if (!args[1]) {
        const session = await resolveAuthorizationSession();
        if (!session)
          return undefined;
        operation.requirePermission(args[0]);
      }
      const account = await claims.findAccount(...args);
      if (!account)
        return undefined;
      operation.requirePermission(account.accountId);
      return {
        accountId: account.accountId,
        async claims(...claimArgs: Parameters<typeof account.claims>) {
          operation.requirePermission(account.accountId);
          return await account.claims(...claimArgs);
        },
      };
    },
  };
}
