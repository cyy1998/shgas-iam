import type { ClientSnapshotReader, ClientSnapshotValue } from "@iam/client-snapshot";
import type { ApplicationAdmissionInput, ApplicationAdmissionResult } from "@iam/contracts";
import { ClientSsoCallbackType, LoginPageGuardDecision } from "@iam/contracts";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import type { SubjectAccessOperation } from "@iam/subject-access";
import { z } from "zod";
import { CustomSsoAdmissionUnavailableError, InvalidRedirectUriError } from "../authorization.error";
import type { createSsoRedirectUrlValidator } from "../internal/redirect-url.validator";
import { type AuthorizationInput, createCustomSsoAuthorizationContext } from "./continuation";
import type { AcceptedAuthorization, CustomSsoStateRedis } from "./state";
import { randomHandle } from "./state";

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

export function createUnifiedCustomSsoAuthorization(options: UnifiedCustomSsoAuthorizationOptions) {
  const codeTtl = z.number().int().positive().parse(options.codeTtlSeconds);
  const continuationTtl = z.number().int().positive().parse(options.continuationTtlSeconds);
  const { state, forOperation } = createCustomSsoAuthorizationContext(options);
  return {
    forOperation(operation: SubjectAccessOperation) {
      const { client, continuation, root, inspectLoginContinuation } = forOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function accept(input: AuthorizationInput): Promise<{
        accepted: AcceptedAuthorization;
        client: ClientSnapshotValue;
        expiresAt?: number;
      }> {
        const snapshot = await client(input.clientCode);
        if (input.continuation !== undefined) return await continuation(input, snapshot);
        const config = snapshot.ssoConfig;
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
          client: snapshot,
          accepted: {
            clientCode: input.clientCode,
            redirectUrl,
            callbackEndpoint,
            redeemer: config.callbackType,
            ...(input.state === undefined ? {} : { state: input.state }),
          },
        };
      }
      return {
        inspectLoginContinuation,
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
