import type { ClientSnapshotReader, ClientSnapshotValue } from "@iam/api-core/client-snapshot";
import type { createClientSecretAuthenticator } from "@iam/api-core/client-snapshot/credentials";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { OptionalSubjectClaim, SubjectFactsSnapshot } from "@iam/client-subject-projection";
import type { ClientSessionObservation, RevocationResult, UnifiedSessionKernel } from "@iam/session-kernel";
import type { OidcCodeConsumption } from "./errors";
import type { OidcSigningPort } from "./signing";
import type { OidcStateRedis } from "./state";
import type { OidcTokenRecord } from "./token-state";
import type { OidcTokenResponse } from "./wire";
import { createHash, randomUUID } from "node:crypto";
import { requireSubjectAccessOperation, SubjectAccessDisabledError } from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  ClientCodeSchema,
  ClientSsoProtocol,
  ClientStatus,
  OidcClientType,
  SubjectClaim,
} from "@iam/contracts";
import { z } from "zod";
import { OidcExchangeFailure, OidcProtocolError, OidcStateUnavailableError } from "./errors";
import { codeDigest, codeRecordSchema, createOidcState, digest, parseOidcCode, randomHandle } from "./state";
import { createOidcTokenState } from "./token-state";

export interface OidcTokenOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  credentials: ReturnType<typeof createClientSecretAuthenticator>;
  subjectFacts: { read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null> };
  signing: OidcSigningPort;
  redis: OidcStateRedis;
  namespace: string;
  tokenTtlSeconds: number;
  failureEffectTimeoutMs?: number;
}
export interface OidcTokenInput {
  clientId: string;
  authentication: "none" | "client_secret_basic";
  clientSecret?: string;
  code: string;
  grantType: string;
  redirectUri?: string;
  codeVerifier?: string;
  invalidParameters?: boolean;
  origin?: string;
  allowOrigin?: () => void;
}

function invalidGrant(): never {
  throw new OidcProtocolError("invalid_grant", "Authorization grant is invalid");
}
function accept(snapshot: ClientSnapshotValue) {
  if (snapshot.status === ClientStatus.Maintenance)
    throw new OidcProtocolError("temporarily_unavailable", "Client is under maintenance", 503);
  if (
    snapshot.status !== ClientStatus.Enable
    || !snapshot.ssoEnabled
    || snapshot.ssoConfig?.protocol !== ClientSsoProtocol.Oidc
  ) {
    throw new OidcProtocolError("unauthorized_client", "Client is not enabled for OIDC");
  }
  return snapshot.ssoConfig;
}
function matches(
  record: OidcTokenRecord | z.infer<typeof codeRecordSchema>,
  observation: ClientSessionObservation,
) {
  return (
    record.userSessionId === observation.userSession.userSessionId
    && record.clientSessionId === observation.clientSession.clientSessionId
    && record.userSessionInstance === observation.userSession.instance
    && record.clientSessionInstance === observation.clientSession.instance
    && record.clientId === observation.clientSession.clientId
  );
}

/** Exchange, preparation and delivery share one bounded failure boundary. No Token compensation or replay. */
export function createOidcTokens(options: OidcTokenOptions) {
  const ttl = z.number().int().positive().parse(options.tokenTtlSeconds);
  const timeout = z
    .number()
    .int()
    .min(1)
    .max(5000)
    .parse(options.failureEffectTimeoutMs ?? 1000);
  const codes = createOidcState(options.redis, options.namespace);
  const tokens = createOidcTokenState(options.redis, options.namespace);
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts: options.subjectFacts,
    assertPermission: (operation, subject) =>
      requireSubjectAccessOperation(operation).requirePermission(subject),
  });
  return {
    jwks: options.signing.jwks,
    discovery: (issuer: string) => ({
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
      id_token_signing_alg_values_supported: ["RS256"],
    }),
    forOperation(operation: SubjectAccessOperation, issuer: string) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function permitted(target: { userSessionId: string; clientSessionId: string; clientId: string }) {
        const resolved = await sessions.resolveClientSessionForUse(target);
        if (resolved.status === "corrupt")
          throw new OidcStateUnavailableError("corrupt");
        if (resolved.status !== "resolved")
          invalidGrant();
        const root = resolved.value.userSession;
        try {
          await operation.acquireForSession({
            principalSessionId: root.userSessionId,
            subjectIdentifier: root.subjectIdentifier,
            subjectContext: root.subjectContext,
          });
        }
        catch (error) {
          if (error instanceof SubjectAccessDisabledError)
            invalidGrant();
          throw error;
        }
        return resolved.value;
      }
      return {
        async exchange<T>(
          input: OidcTokenInput,
          deliver: (result: OidcTokenResponse) => Promise<T> | T,
        ): Promise<T> {
          if (!ClientCodeSchema.safeParse(input.clientId).success)
            throw new OidcProtocolError("invalid_client", "Client authentication failed", 401);
          const snapshot = await options.clients.acquire(input.clientId);
          if (snapshot.kind !== "present" || snapshot.value.clientCode !== input.clientId)
            throw new OidcProtocolError("invalid_client", "Client authentication failed", 401);
          // A selected Public OIDC client is the only none exception.
          // Switching away cannot bypass Secret authentication.
          const publicClient
            = snapshot.value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
              && snapshot.value.ssoConfig.clientType === OidcClientType.Public;
          if (
            publicClient
            && snapshot.value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
            && input.origin
            && snapshot.value.ssoConfig.redirectUris.some(uri => new URL(uri).origin === input.origin)
          ) {
            input.allowOrigin?.();
          }
          if (!publicClient) {
            if (input.authentication !== "client_secret_basic" || !input.clientSecret)
              throw new OidcProtocolError("invalid_client", "Client authentication failed", 401);
            const authenticated = await options.credentials.authenticate(input.clientId, input.clientSecret);
            if (!authenticated || authenticated.clientCode !== input.clientId)
              throw new OidcProtocolError("invalid_client", "Client authentication failed", 401);
          }
          else if (input.authentication !== "none") {
            throw new OidcProtocolError("invalid_client", "Client authentication method is not allowed", 401);
          }
          if (!input.code)
            throw new OidcProtocolError("invalid_request", "code is required");
          const identity = parseOidcCode(input.code);
          if (!identity)
            invalidGrant();
          const target = {
            userSessionId: identity.userSessionId,
            clientSessionId: identity.clientSessionId,
            clientId: input.clientId,
          };
          const root = await sessions.observeUserSessionForRevocation(target.userSessionId);
          const located = await sessions.observeClientSessionForRevocation(target);
          if (root.status === "corrupt" || located.status === "corrupt")
            throw new OidcStateUnavailableError("corrupt");
          if (
            root.status !== "resolved"
            || located.status !== "resolved"
            || root.value.target.subjectIdentifier !== located.value.target.subjectIdentifier
          ) {
            invalidGrant();
          }
          let consumption: OidcCodeConsumption = "not_attempted";
          try {
            const config = accept(snapshot.value);
            if (
              input.origin
              && (!publicClient || !config.redirectUris.some(uri => new URL(uri).origin === input.origin))
            ) {
              throw new OidcProtocolError("invalid_request", "Origin is not allowed");
            }
            if (input.invalidParameters)
              throw new OidcProtocolError("invalid_request", "Invalid token parameters");
            if (!input.grantType)
              throw new OidcProtocolError("invalid_request", "grant_type is required");
            if (input.grantType !== "authorization_code")
              throw new OidcProtocolError("unsupported_grant_type", "Only authorization_code is supported");
            consumption = "unknown";
            const taken = await codes.takeCode(input.clientId, identity);
            if (!taken) {
              consumption = "missing";
              invalidGrant();
            }
            consumption = "consumed";
            let payload: unknown;
            try {
              payload = JSON.parse(taken.raw);
            }
            catch {
              throw new OidcStateUnavailableError("corrupt");
            }
            const parsed = codeRecordSchema.safeParse(payload);
            if (!parsed.success)
              throw new OidcStateUnavailableError("corrupt");
            const code = parsed.data;
            if (
              codeDigest(code.clientId, code) !== codeDigest(input.clientId, identity)
              || code.issuer !== issuer
              || code.clientId !== input.clientId
              || code.userSessionInstance !== root.value.target.instance
              || code.clientSessionInstance !== located.value.target.instance
              || code.issuedAt > taken.now
              || code.expiresAt <= taken.now
              || code.expiresAt <= code.issuedAt
            ) {
              invalidGrant();
            }
            if (!input.redirectUri || !input.codeVerifier)
              throw new OidcProtocolError("invalid_request", "redirect_uri and code_verifier are required");
            if (
              input.redirectUri !== code.redirectUri
              || !/^[\w.~-]{43,128}$/u.test(input.codeVerifier)
              || createHash("sha256").update(input.codeVerifier!).digest("base64url") !== code.codeChallenge
            ) {
              invalidGrant();
            }
            const observed = await permitted(target);
            if (
              !matches(code, observed)
              || code.expiresAt > observed.userSession.expiresAt
              || code.expiresAt > observed.clientSession.expiresAt
            ) {
              invalidGrant();
            }
            const lifetime = await sessions.getIssuanceLifetime(observed, ttl);
            if (lifetime.remainingSeconds <= 0)
              invalidGrant();
            const claims: OptionalSubjectClaim[] = [];
            const scopes = new Set(code.scope.split(" "));
            if (scopes.has("profile"))
              claims.push(SubjectClaim.ProfileUsername, SubjectClaim.ProfileName);
            if (scopes.has("phone"))
              claims.push(SubjectClaim.ProfilePhone);
            const subject = await projection.resolve(
              {
                subjectIdentifier: observed.userSession.subjectIdentifier,
                clientCode: input.clientId,
                selection: { catalogVersion: 2, optionalClaims: claims },
              },
              operation,
            );
            const idToken = await options.signing.sign({
              sub: subject.subjectIdentifier,
              iss: code.issuer,
              aud: input.clientId,
              iat: Math.floor(lifetime.issuedAt / 1000),
              exp: Math.floor(lifetime.expiresAt / 1000),
              auth_time: Math.floor(observed.userSession.authTime / 1000),
              ...(code.nonce === undefined ? {} : { nonce: code.nonce }),
              ...(subject.username === undefined ? {} : { preferred_username: subject.username }),
              ...(subject.name === undefined ? {} : { name: subject.name }),
              ...(subject.phone ? { phone_number: subject.phone } : {}),
            });
            const bearer = `oa_${randomHandle()}`;
            await tokens.save(bearer, {
              issuer: code.issuer,
              version: 1,
              purpose: "oidc_access",
              id: randomUUID(),
              digest: digest(bearer),
              clientId: input.clientId,
              userSessionId: code.userSessionId,
              clientSessionId: code.clientSessionId,
              userSessionInstance: code.userSessionInstance,
              clientSessionInstance: code.clientSessionInstance,
              scope: code.scope,
              issuedAt: lifetime.issuedAt,
              expiresAt: lifetime.expiresAt,
            });
            return await deliver({
              access_token: bearer,
              token_type: "Bearer",
              expires_in: lifetime.remainingSeconds,
              id_token: idToken,
              scope: code.scope,
            });
          }
          catch (failure) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            let revocation: RevocationResult;
            try {
              revocation = await Promise.race([
                sessions.revokeObservedClientSession(located.value),
                new Promise<RevocationResult>((resolve) => {
                  timer = setTimeout(resolve, timeout, { target: located.value.target, status: "unknown" });
                }),
              ]);
            }
            finally {
              clearTimeout(timer);
            }
            throw new OidcExchangeFailure(failure, consumption, revocation);
          }
        },
        async resolveAccessToken(bearer: string) {
          const record = await tokens.read(bearer);
          if (!record || record.issuer !== issuer)
            invalidGrant();
          const snapshot = await options.clients.acquire(record.clientId);
          if (snapshot.kind !== "present" || snapshot.value.clientCode !== record.clientId)
            invalidGrant();
          const config = accept(snapshot.value);
          const observation = await permitted({
            userSessionId: record.userSessionId,
            clientSessionId: record.clientSessionId,
            clientId: record.clientId,
          });
          if (!matches(record, observation))
            invalidGrant();
          return { token: Object.freeze({ ...record }), observation, config };
        },
      };
    },
  };
}
export type OidcTokens = ReturnType<typeof createOidcTokens>;
