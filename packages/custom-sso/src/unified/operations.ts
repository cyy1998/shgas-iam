import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { PermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import type { SubjectClaimName } from "@iam/contracts";
import type { AuditRequestContext } from "@iam/domain/audit";
import type { ClientSessionObservation, RevocationResult, UnifiedSessionKernel } from "@iam/session-kernel";
import type {
  CustomSsoAuditPort,
  CustomSsoLoggerPort,
  CustomSsoOrcasPort,
  CustomSsoOrcasUser,
  CustomSsoProjectionPermission,
} from "../custom-sso.port";
import type { CustomSsoSubjectProjection } from "../wire";
import type { CustomSsoStateRedis } from "./state";
import type { CustomSsoTokenRecord } from "./token-state";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import {
  AuthzMaintenanceError,
  AuthzUnauthorizedError,
  BadRequestError,
  InvalidSsoClientError,
} from "@iam/api-core/errors";
import { observabilityLogFields } from "@iam/api-core/observability";
import { requireSubjectAccessOperation, SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import { parseSubjectClaimSelection } from "@iam/client-subject-projection";
import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, SubjectClaim } from "@iam/contracts";
import { SessionStorageError } from "@iam/session-kernel";
import { z } from "zod";
import {
  buildGatewayLoginSuccessAudit,
  buildIndependentLoginSuccessAudit,
  withRequestContext,
} from "../internal/audit";
import { CustomSsoTrafficGateUnavailableError } from "../internal/traffic-gate";
import { CustomSsoRequestMismatchError } from "../protocol-validation.error";
import { resolveCustomSsoSubjectProjection } from "../wire";
import {
  createCustomSsoState,
  CustomSsoStateUnavailableError,
  parseBusinessCode,
  randomHandle,
} from "./state";
import { createCustomSsoTokenState } from "./token-state";

export interface UnifiedCustomSsoOperationsOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  credentials: {
    authenticate: (clientCode: string, secret: string) => Promise<{ clientCode: string } | null>;
  };
  projection: PermittedClientSubjectProjectionService<CustomSsoProjectionPermission>;
  redis: CustomSsoStateRedis;
  namespace: string;
  tokenTtlSeconds: number;
  business?: { audit: CustomSsoAuditPort; logger: CustomSsoLoggerPort };
  managed?: {
    orcas: CustomSsoOrcasPort;
    users: {
      findOrcasUserBySubjectIdentifier: (subjectIdentifier: string) => Promise<CustomSsoOrcasUser | null>;
    };
    audit: CustomSsoAuditPort;
    logger: CustomSsoLoggerPort;
  };
  /** Maximum wait for each of the two synchronous failure effects; neither is retried. */
  failureEffectTimeoutMs?: number;
}
export interface CustomSsoExchangeResult {
  sid: string;
  ttl: number;
  subject: CustomSsoSubjectProjection;
}
export interface CustomSsoManagedResult {
  token: string;
  ttl: number;
  redirectUrl: string;
  state?: string;
  orcasSessionId: string | null;
}
export type CodeConsumptionOutcome
  = "not_attempted" | "consumed" | "missing" | "changed" | "corrupt" | "unknown";
export class CustomSsoExchangeFailure extends Error {
  constructor(
    readonly failure: unknown,
    readonly consumption: CodeConsumptionOutcome,
    readonly revocation: RevocationResult,
    readonly tokenCompensation: "not_attempted" | "removed" | "missing" | "replaced" | "unknown",
  ) {
    super("Custom SSO exchange failed; authorize again");
  }
}
export class CustomSsoManagedFailure extends Error {
  constructor(
    readonly failure: unknown,
    readonly consumption: CodeConsumptionOutcome,
    readonly tokenCompensation: CustomSsoExchangeFailure["tokenCompensation"],
  ) {
    super("Custom SSO managed callback failed; authorize again");
  }
}

/** Complete business operation; delivery runs inside the same failure/revocation boundary. */
export function createUnifiedCustomSsoOperations(options: UnifiedCustomSsoOperationsOptions) {
  const tokenTtl = z.number().int().positive().parse(options.tokenTtlSeconds);
  const failureTimeout = z
    .number()
    .int()
    .min(1)
    .max(5000)
    .parse(options.failureEffectTimeoutMs ?? 1000);
  async function bounded<T>(effect: Promise<T>, unknown: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        effect,
        new Promise<T>((resolve) => {
          timer = setTimeout(resolve, failureTimeout, unknown);
        }),
      ]);
    }
    finally {
      clearTimeout(timer);
    }
  }
  const codes = createCustomSsoState(options.redis, options.namespace);
  const tokens = createCustomSsoTokenState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function accept(clientCode: string) {
        let snapshot;
        try {
          snapshot = await options.clients.acquire(clientCode);
        }
        catch (error) {
          if (error instanceof ClientSnapshotUnavailableError)
            throw new CustomSsoTrafficGateUnavailableError();
          throw error;
        }
        if (snapshot.kind === "present" && snapshot.value.status === ClientStatus.Maintenance)
          throw new AuthzMaintenanceError();
        if (
          snapshot.kind !== "present"
          || snapshot.value.clientCode !== clientCode
          || snapshot.value.status !== ClientStatus.Enable
          || !snapshot.value.ssoEnabled
          || snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
        ) {
          throw new InvalidSsoClientError();
        }
        return snapshot.value.ssoConfig;
      }
      async function permitted(target: { userSessionId: string; clientSessionId: string; clientId: string }) {
        let resolved;
        try {
          resolved = await sessions.resolveClientSessionForUse(target);
        }
        catch (error) {
          if (error instanceof SessionStorageError)
            throw new SubjectAccessUnavailableError();
          throw error;
        }
        if (resolved.status === "corrupt")
          throw new SubjectAccessUnavailableError();
        if (resolved.status !== "resolved")
          throw new AuthzUnauthorizedError();
        const root = resolved.value.userSession;
        const permission = await operation.acquireForSession({
          principalSessionId: root.userSessionId,
          subjectIdentifier: root.subjectIdentifier,
          subjectContext: root.subjectContext,
        });
        return { observation: resolved.value, proof: { operation, permission } };
      }
      const matches = (
        record: { userSessionInstance: string; clientSessionInstance: string },
        observation: ClientSessionObservation,
      ) =>
        record.userSessionInstance === observation.userSession.instance
        && record.clientSessionInstance === observation.clientSession.instance;
      async function project(
        clientCode: string,
        access: Awaited<ReturnType<typeof permitted>>,
        claims: SubjectClaimName[],
      ) {
        return await resolveCustomSsoSubjectProjection(
          { resolve: input => options.projection.resolve(input, access.proof) },
          {
            subjectIdentifier: access.observation.userSession.subjectIdentifier,
            clientCode,
            selection: parseSubjectClaimSelection({ catalogVersion: 2, claims }),
          },
        );
      }
      async function prepareToken(
        access: Awaited<ReturnType<typeof permitted>>,
        purpose: "business" | "managed",
      ) {
        const lifetime = await sessions.getIssuanceLifetime(access.observation, tokenTtl);
        if (lifetime.remainingSeconds <= 0)
          throw new AuthzUnauthorizedError();
        const { userSession, clientSession } = access.observation;
        const record: CustomSsoTokenRecord = {
          version: 1,
          protocol: "custom_sso",
          purpose,
          tokenId: randomUUID(),
          clientCode: clientSession.clientId,
          userSessionId: userSession.userSessionId,
          clientSessionId: clientSession.clientSessionId,
          userSessionInstance: userSession.instance,
          clientSessionInstance: clientSession.instance,
          issuedAt: lifetime.issuedAt,
          expiresAt: lifetime.expiresAt,
        };
        return { bearer: `cs_${randomHandle()}`, record, ttl: lifetime.remainingSeconds };
      }
      async function compensate(token?: {
        bearer: string;
        record: CustomSsoTokenRecord;
      }): Promise<CustomSsoExchangeFailure["tokenCompensation"]> {
        if (!token)
          return "not_attempted";
        try {
          return await bounded(tokens.remove(token.bearer, token.record), "unknown");
        }
        catch {
          return "unknown";
        }
      }
      async function authenticateToken(bearer: string, clientCode: string, purpose?: "business" | "managed") {
        const token = await tokens.read(bearer);
        if (!token)
          throw new AuthzUnauthorizedError();
        if (
          token.record.clientCode !== clientCode
          || (purpose !== undefined && token.record.purpose !== purpose)
        ) {
          throw new CustomSsoRequestMismatchError();
        }
        const access = await permitted({
          userSessionId: token.record.userSessionId,
          clientSessionId: token.record.clientSessionId,
          clientId: clientCode,
        });
        if (!matches(token.record, access.observation))
          throw new AuthzUnauthorizedError();
        const config = await accept(clientCode);
        return { access, config };
      }
      return {
        async completeCallback<T = CustomSsoManagedResult>(
          input: {
            clientCode: string;
            code: string;
            redirectUrl: string;
            requestContext?: AuditRequestContext;
          },
          deliver?: (result: CustomSsoManagedResult) => Promise<T> | T,
        ): Promise<T | CustomSsoManagedResult> {
          let consumption: CodeConsumptionOutcome = "not_attempted";
          let knownToken: { bearer: string; record: CustomSsoTokenRecord } | undefined;
          try {
            const managed = options.managed;
            const config = await accept(input.clientCode);
            if (!managed || config.callbackType !== ClientSsoCallbackType.Managed)
              throw new InvalidSsoClientError();
            let code;
            try {
              code = await codes.readCode(input.clientCode, input.code);
            }
            catch (error) {
              consumption = error instanceof CustomSsoStateUnavailableError ? error.outcome : "unknown";
              throw error;
            }
            if (!code) {
              consumption = "missing";
              throw new AuthzUnauthorizedError("Code 已失效，请重新授权");
            }
            // Original purpose is immutable: a later configuration edit cannot bypass the business Secret.
            if (
              code.redeemer !== "managed"
              || code.callbackEndpoint !== `${new URL(code.redirectUrl).origin}/sso/callback`
              || code.redirectUrl !== input.redirectUrl
            ) {
              throw new CustomSsoRequestMismatchError();
            }
            const access = await permitted({
              userSessionId: code.userSessionId,
              clientSessionId: code.clientSessionId,
              clientId: input.clientCode,
            });
            if (!matches(code, access.observation))
              throw new AuthzUnauthorizedError();
            consumption = "unknown";
            consumption = await codes.consumeCode(code);
            if (consumption !== "consumed")
              throw new AuthzUnauthorizedError("Code 已失效，请重新授权");
            let orcasSessionId: string | null = null;
            if (config.orcas?.enabled) {
              operation.requirePermission(access.observation.userSession.subjectIdentifier);
              const user = await managed.users.findOrcasUserBySubjectIdentifier(
                access.observation.userSession.subjectIdentifier,
              );
              if (!user)
                throw new AuthzUnauthorizedError();
              orcasSessionId = (await managed.orcas.orcasLogin(user)).orcasSessionId;
            }
            // This delivery needs no full Subject. ORCAS references never enter the generic Projection or Token.
            const prepared = await prepareToken(access, "managed");
            knownToken = prepared;
            await tokens.save(prepared.bearer, prepared.record);
            try {
              await managed.audit.recordAuditLog(
                withRequestContext(
                  input.requestContext,
                  buildGatewayLoginSuccessAudit(
                    access.observation.userSession.subjectIdentifier,
                    input.clientCode,
                  ),
                ),
              );
            }
            catch {
              managed.logger.warn(
                {
                  clientCode: input.clientCode,
                  operation: "gateway_login_audit",
                  outcome: "audit_failed",
                  ...observabilityLogFields(input.requestContext),
                },
                "custom sso Gateway login audit after-effect failed",
              );
            }
            const result = {
              token: prepared.bearer,
              ttl: prepared.ttl,
              redirectUrl: code.redirectUrl,
              state: code.state,
              orcasSessionId,
            };
            return deliver ? await deliver(result) : result;
          }
          catch (failure) {
            // Q38: no root Cookie gate and no business-exchange revocation of the shared ClientSession.
            throw new CustomSsoManagedFailure(failure, consumption, await compensate(knownToken));
          }
        },
        async exchange<T = CustomSsoExchangeResult>(
          input: {
            clientCode: string;
            clientSecret: string;
            code: string;
            redirectUri: unknown;
            invalidParameters?: boolean;
            requestContext?: AuditRequestContext;
          },
          deliver?: (result: CustomSsoExchangeResult) => Promise<T> | T,
        ): Promise<T | CustomSsoExchangeResult> {
          const authenticated = await options.credentials.authenticate(input.clientCode, input.clientSecret);
          if (!authenticated || authenticated.clientCode !== input.clientCode)
            throw new InvalidSsoClientError();
          const locator = parseBusinessCode(input.code);
          if (!locator)
            throw new BadRequestError("非法 Code");
          const target = {
            userSessionId: locator.userSessionId,
            clientSessionId: locator.clientSessionId,
            clientId: input.clientCode,
          };
          let located;
          try {
            located = await sessions.observeClientSessionForRevocation(target);
          }
          catch (error) {
            if (error instanceof SessionStorageError)
              throw new SubjectAccessUnavailableError();
            throw error;
          }
          if (located.status !== "resolved") {
            if (located.status === "corrupt")
              throw new SubjectAccessUnavailableError();
            throw new BadRequestError("非法 Code 归属");
          }
          let consumption: CodeConsumptionOutcome = "not_attempted";
          let knownToken: { bearer: string; record: CustomSsoTokenRecord } | undefined;
          try {
            const config = await accept(input.clientCode);
            if (input.invalidParameters || !z.url().safeParse(input.redirectUri).success)
              throw new BadRequestError();
            let code;
            try {
              code = await codes.readCode(input.clientCode, input.code);
            }
            catch (error) {
              consumption = error instanceof CustomSsoStateUnavailableError ? error.outcome : "unknown";
              throw error;
            }
            if (!code) {
              consumption = "missing";
              throw new BadRequestError("Code 已失效，请重新授权");
            }
            if (
              code.redeemer !== "business"
              || config.callbackType !== ClientSsoCallbackType.Business
              || code.callbackEndpoint !== new URL(config.callbackEndpoint).href
              || code.redirectUrl !== input.redirectUri
            ) {
              throw new BadRequestError("Code 用途或交付地址不匹配");
            }
            const access = await permitted(target);
            if (
              !matches(code, access.observation)
              || access.observation.clientSession.instance !== located.value.target.instance
            ) {
              throw new BadRequestError("Code 原实例已失效");
            }
            consumption = "unknown";
            consumption = await codes.consumeCode(code);
            if (consumption !== "consumed")
              throw new BadRequestError("Code 已失效，请重新授权");
            const subject = await project(input.clientCode, access, [...config.subjectClaims]);
            const prepared = await prepareToken(access, "business");
            knownToken = prepared;
            await tokens.save(prepared.bearer, prepared.record);
            const result = { sid: prepared.bearer, ttl: prepared.ttl, subject };
            if (options.business) {
              try {
                await options.business.audit.recordAuditLog(
                  withRequestContext(
                    input.requestContext,
                    buildIndependentLoginSuccessAudit(
                      access.observation.userSession.subjectIdentifier,
                      input.clientCode,
                    ),
                  ),
                );
              }
              catch {
                options.business.logger.warn(
                  {
                    clientCode: input.clientCode,
                    operation: "independent_login_audit",
                    outcome: "audit_failed",
                    ...observabilityLogFields(input.requestContext),
                  },
                  "custom sso independent login audit after-effect failed",
                );
              }
            }
            return deliver ? await deliver(result) : result;
          }
          catch (failure) {
            // One exact attempt is the request budget. No background work or signing replay.
            const revocation = await bounded<RevocationResult>(
              sessions.revokeObservedClientSession(located.value),
              { target: located.value.target, status: "unknown" },
            );
            const compensation = await compensate(knownToken);
            throw new CustomSsoExchangeFailure(failure, consumption, revocation, compensation);
          }
        },
        async logout(bearer: string) {
          const token = await tokens.read(bearer);
          if (!token)
            return false;
          const record = token.record;
          const resolved = await sessions.resolveClientSessionForUse({
            userSessionId: record.userSessionId,
            clientSessionId: record.clientSessionId,
            clientId: record.clientCode,
          });
          if (resolved.status === "corrupt")
            throw new SubjectAccessUnavailableError();
          if (resolved.status !== "resolved")
            return false;
          if (!matches(record, resolved.value))
            throw new AuthzUnauthorizedError();
          const client = await options.clients.acquire(record.clientCode);
          if (
            client.kind !== "present"
            || client.value.clientCode !== record.clientCode
            || client.value.status === ClientStatus.Disable
            || !client.value.ssoEnabled
            || client.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
          ) {
            throw new AuthzUnauthorizedError();
          }
          // Logout observes the original relationship without asking Subject Access permission.
          const root = await sessions.resolveUserSessionById(record.userSessionId);
          if (root.status === "corrupt")
            throw new SubjectAccessUnavailableError();
          if (root.status !== "resolved")
            return false;
          if (root.value.userSession.instance !== record.userSessionInstance)
            throw new AuthzUnauthorizedError();
          const result = await sessions.revokeObservedUserSession(root.value);
          if (result.status === "failed" || result.status === "unknown")
            throw new SubjectAccessUnavailableError();
          return true;
        },
        async resolvePublicAuthentication(
          bearer: string,
          clientCode: string,
          purpose?: "business" | "managed",
        ) {
          const { access, config } = await authenticateToken(bearer, clientCode, purpose);
          return {
            authenticationContext: {
              subjectIdentifier: access.observation.userSession.subjectIdentifier,
              authenticatedClientCode: clientCode,
            },
            subjectDeliveryCapability: Object.freeze({
              resolveUserInfo: () => project(clientCode, access, [...config.subjectClaims]),
            }),
          };
        },
        async authorizeLocalSession(bearer: string, clientCode: string, purpose?: "business" | "managed") {
          const { access, config } = await authenticateToken(bearer, clientCode, purpose);
          const subject = await project(
            clientCode,
            access,
            config.subjectClaims.filter(
              claim =>
                claim === SubjectClaim.SubjectIdentifier
                || claim === SubjectClaim.ProfileUsername
                || claim === SubjectClaim.ProfileName,
            ),
          );
          return Buffer.from(
            JSON.stringify({ version: 1, subjectIdentifier: subject.subjectIdentifier, ...subject.profile }),
            "utf8",
          ).toString("base64");
        },
      };
    },
  };
}
export type UnifiedCustomSsoOperations = ReturnType<typeof createUnifiedCustomSsoOperations>;
