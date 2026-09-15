import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import type { createSsoRedirectUrlValidator } from "../internal/redirect-url.validator";
import type { AcceptedAuthorization, CustomSsoStateRedis } from "./state";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import {
  AuthzMaintenanceError,
  AuthzUnauthorizedError,
  BadRequestError,
  InvalidRedirectUriError,
  InvalidSsoClientError,
} from "@iam/api-core/errors";
import {
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { ClientSsoProtocol, ClientStatus, LoginPageGuardDecision } from "@iam/contracts";
import { createClientSsoCallbackClassifier } from "@iam/domain/client/sso-callback";
import { SessionStorageError } from "@iam/session-kernel";
import { z } from "zod";
import { CustomSsoTrafficGateUnavailableError } from "../internal/traffic-gate";
import { createCustomSsoState, randomHandle } from "./state";

export interface UnifiedCustomSsoAuthorizationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: CustomSsoStateRedis;
  namespace: string;
  codeTtlSeconds: number;
  continuationTtlSeconds: number;
  trustedIamOrigins: readonly string[];
  /** Actual deployed complete URLs of the managed handler, supplied by server composition. */
  managedCallbackUrls: readonly string[];
  redirectUrls: ReturnType<typeof createSsoRedirectUrlValidator>;
}

interface AuthorizationInput {
  clientCode: string;
  redirectUrl: string;
  state?: string;
  globalSessionToken?: string;
  continuation?: string;
  browserBinding?: string;
}

export function createUnifiedCustomSsoAuthorization(options: UnifiedCustomSsoAuthorizationOptions) {
  const codeTtl = z.number().int().positive().parse(options.codeTtlSeconds);
  const continuationTtl = z.number().int().positive().parse(options.continuationTtlSeconds);
  const isManagedCallback = createClientSsoCallbackClassifier(options);
  const state = createCustomSsoState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function accept(input: AuthorizationInput): Promise<AcceptedAuthorization> {
        let snapshot;
        try {
          snapshot = await options.clients.acquire(input.clientCode);
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
          || snapshot.value.clientCode !== input.clientCode
          || snapshot.value.status !== ClientStatus.Enable
          || !snapshot.value.ssoEnabled
          || snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
        ) {
          throw new InvalidSsoClientError("非法Client");
        }
        if (input.continuation !== undefined) {
          const accepted = await state.readContinuation(input.continuation, input.browserBinding ?? "");
          if (
            !accepted
            || accepted.clientCode !== input.clientCode
            || accepted.redirectUrl !== input.redirectUrl
            || accepted.state !== input.state
          ) {
            throw new BadRequestError("登录请求已失效，请返回应用重新发起登录");
          }
          return accepted;
        }
        const config = snapshot.value.ssoConfig;
        const redirectUrl = options.redirectUrls.normalizeAllowed(
          input.clientCode,
          input.redirectUrl,
          config.validRedirectUrls,
        );
        if (redirectUrl === null)
          throw new InvalidRedirectUriError("非法重定向地址");
        const callbackEndpoint = new URL(config.callbackEndpoint).href;
        return {
          clientCode: input.clientCode,
          redirectUrl,
          callbackEndpoint,
          redeemer: isManagedCallback(callbackEndpoint) ? "managed" : "business",
          ...(input.state === undefined ? {} : { state: input.state }),
        };
      }
      async function root(token?: string) {
        if (!token)
          return null;
        try {
          const result = await sessions.resolveUserSession(token);
          if (result.status === "corrupt")
            throw new SubjectAccessUnavailableError();
          if (result.status !== "resolved")
            return null;
          const user = result.value.userSession;
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
          return result.value;
        }
        catch (error) {
          if (error instanceof SubjectAccessDisabledError || error instanceof AuthzUnauthorizedError)
            return null;
          if (error instanceof SessionStorageError)
            throw new SubjectAccessUnavailableError();
          throw error;
        }
      }
      return {
        async checkLoginContinuation(input: AuthorizationInput) {
          await accept(input);
          const observation = await root(input.globalSessionToken);
          return {
            decision: observation ? LoginPageGuardDecision.Continue : LoginPageGuardDecision.Login,
            clearGlobalSessionCookie: Boolean(input.globalSessionToken && !observation),
          };
        },
        async authorize(input: AuthorizationInput) {
          const accepted = await accept(input);
          const observation = await root(input.globalSessionToken);
          if (!observation) {
            const browserBinding = input.browserBinding || randomHandle();
            const continuation
              = input.continuation ?? (await state.saveContinuation(accepted, browserBinding, continuationTtl));
            return {
              isLogin: false as const,
              ...accepted,
              continuation,
              browserBinding,
              continuationTtlSeconds: continuationTtl,
              clearGlobalSessionCookie: Boolean(input.globalSessionToken),
            };
          }
          const opened = await sessions.openClientSession(observation, {
            clientId: accepted.clientCode,
            protocol: "custom_sso",
          });
          if (opened.status !== "created" && opened.status !== "reused")
            throw new AuthzUnauthorizedError("会话已失效");
          const lifetime = await sessions.getIssuanceLifetime(opened.value, codeTtl);
          if (lifetime.remainingSeconds <= 0)
            throw new AuthzUnauthorizedError("会话已失效");
          const codeId = randomHandle();
          const { userSession, clientSession } = sessions.useObservation(opened.value);
          if (!clientSession)
            throw new AuthzUnauthorizedError();
          await state.saveCode({
            ...accepted,
            version: 1,
            protocol: "custom_sso",
            codeId,
            userSessionId: userSession.userSessionId,
            clientSessionId: clientSession.clientSessionId,
            userSessionInstance: userSession.instance,
            clientSessionInstance: clientSession.instance,
            issuedAt: lifetime.issuedAt,
            expiresAt: lifetime.expiresAt,
          });
          return {
            isLogin: true as const,
            ...accepted,
            code: `${codeId}.${userSession.userSessionId}.${clientSession.clientSessionId}`,
          };
        },
      };
    },
  };
}

export type UnifiedCustomSsoAuthorization = ReturnType<typeof createUnifiedCustomSsoAuthorization>;
