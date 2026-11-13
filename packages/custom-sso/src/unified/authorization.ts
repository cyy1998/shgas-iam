import type { ClientSnapshotReader, ClientSnapshotValue } from "@iam/client-snapshot";
import { ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import type { ApplicationAdmissionInput, ApplicationAdmissionResult } from "@iam/contracts";
import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, LoginPageGuardDecision } from "@iam/contracts";
import { AuthzMaintenanceError, AuthzUnauthorizedError, BadRequestError } from "@iam/runtime/errors";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import { SessionStorageError } from "@iam/session-kernel";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { z } from "zod";
import {
  CustomSsoAdmissionUnavailableError,
  InvalidRedirectUriError,
  InvalidSsoClientError,
} from "../authorization.error";
import type { createSsoRedirectUrlValidator } from "../internal/redirect-url.validator";
import { CustomSsoTrafficGateUnavailableError } from "../internal/traffic-gate";
import type { AcceptedAuthorization, CustomSsoStateRedis } from "./state";
import { createCustomSsoState, randomHandle } from "./state";

export interface UnifiedCustomSsoAuthorizationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: CustomSsoStateRedis;
  namespace: string;
  codeTtlSeconds: number;
  continuationTtlSeconds: number;
  redirectUrls: ReturnType<typeof createSsoRedirectUrlValidator>;
  admission: {
    evaluate(input: ApplicationAdmissionInput): Promise<ApplicationAdmissionResult>;
  };
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
  const state = createCustomSsoState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function accept(input: AuthorizationInput): Promise<{
        accepted: AcceptedAuthorization;
        client: ClientSnapshotValue;
      }> {
        let snapshot: Awaited<ReturnType<typeof options.clients.acquire>>;
        try {
          snapshot = await options.clients.acquire(input.clientCode);
        } catch (error) {
          if (error instanceof ClientSnapshotUnavailableError) throw new CustomSsoTrafficGateUnavailableError();
          throw error;
        }
        if (snapshot.kind === "present" && snapshot.value.status === ClientStatus.Maintenance)
          throw new AuthzMaintenanceError();
        if (
          snapshot.kind !== "present" ||
          snapshot.value.clientCode !== input.clientCode ||
          snapshot.value.status !== ClientStatus.Enable ||
          !snapshot.value.ssoEnabled ||
          snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
        ) {
          throw new InvalidSsoClientError("非法Client");
        }
        if (input.continuation !== undefined) {
          const accepted = await state.readContinuation(input.continuation, input.browserBinding ?? "");
          if (
            !accepted ||
            accepted.clientCode !== input.clientCode ||
            accepted.redirectUrl !== input.redirectUrl ||
            accepted.state !== input.state ||
            accepted.redeemer !== snapshot.value.ssoConfig.callbackType
          ) {
            throw new BadRequestError("登录请求已失效，请返回应用重新发起登录");
          }
          return { accepted, client: snapshot.value };
        }
        const config = snapshot.value.ssoConfig;
        const redirectUrl = options.redirectUrls.normalizeAllowed(
          input.clientCode,
          input.redirectUrl,
          config.validRedirectUrls,
        );
        if (redirectUrl === null) throw new InvalidRedirectUriError("非法重定向地址");
        const callbackEndpoint =
          config.callbackType === ClientSsoCallbackType.Managed
            ? `${new URL(redirectUrl).origin}/sso/callback`
            : new URL(config.callbackEndpoint).href;
        return {
          client: snapshot.value,
          accepted: {
            clientCode: input.clientCode,
            redirectUrl,
            callbackEndpoint,
            redeemer: config.callbackType,
            ...(input.state === undefined ? {} : { state: input.state }),
          },
        };
      }
      async function root(token?: string) {
        if (!token) return null;
        try {
          const result = await sessions.resolveUserSession(token);
          if (result.status === "corrupt") throw new SubjectAccessUnavailableError();
          if (result.status !== "resolved") return null;
          const user = result.value.userSession;
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
          return result.value;
        } catch (error) {
          if (error instanceof SubjectAccessDisabledError || error instanceof AuthzUnauthorizedError) return null;
          if (error instanceof SessionStorageError) throw new SubjectAccessUnavailableError();
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
          const { accepted, client } = await accept(input);
          const observation = await root(input.globalSessionToken);
          if (!observation) {
            const browserBinding = input.browserBinding || randomHandle();
            const continuation =
              input.continuation ?? (await state.saveContinuation(accepted, browserBinding, continuationTtl));
            return {
              kind: "login" as const,
              ...accepted,
              continuation,
              browserBinding,
              continuationTtlSeconds: continuationTtl,
              clearGlobalSessionCookie: Boolean(input.globalSessionToken),
            };
          }
          if (client.admissionEnabled) {
            const result = await options.admission.evaluate({
              clientCode: accepted.clientCode,
              subjectIdentifier: observation.userSession.subjectIdentifier,
              filter: client.admissionFilter,
            });
            if (result === "no-match") return { kind: "denied" as const, clientCode: accepted.clientCode };
            if (result !== "match") throw new CustomSsoAdmissionUnavailableError();
          }
          const opened = await sessions.openClientSession(observation, {
            clientId: accepted.clientCode,
            protocol: "custom_sso",
          });
          if (opened.status !== "created" && opened.status !== "reused") throw new AuthzUnauthorizedError("会话已失效");
          const lifetime = await sessions.getIssuanceLifetime(opened.value, codeTtl);
          if (lifetime.remainingSeconds <= 0) throw new AuthzUnauthorizedError("会话已失效");
          const codeId = randomHandle();
          const { userSession, clientSession } = sessions.useObservation(opened.value);
          if (!clientSession) throw new AuthzUnauthorizedError();
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
            kind: "granted" as const,
            ...accepted,
            code: `${codeId}.${userSession.userSessionId}.${clientSession.clientSessionId}`,
          };
        },
      };
    },
  };
}

export type UnifiedCustomSsoAuthorization = ReturnType<typeof createUnifiedCustomSsoAuthorization>;
