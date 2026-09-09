import type { CustomSsoDeps } from "../custom-sso.port";
import type { CustomSsoAccess } from "./session.port";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { createAuthorizeSsoUseCase } from "./authorize-sso/authorize-sso.use-case";
import { createCustomSsoClientSecretVerifier } from "./client-secret-verifier";
import { createCompleteSsoCallbackUseCase } from "./complete-sso-callback/complete-sso-callback.use-case";
import { createExchangeSsoCodeUseCase } from "./exchange-sso-code/exchange-sso-code.use-case";
import { createCheckSsoLoginContinuation } from "./login-continuation";
import { createSsoRedirectUrlValidator } from "./redirect-url.validator";
import { createCustomSsoSessionKernelAdapter } from "./session";
import { createCustomSsoSubjectDelivery } from "./subject-delivery";
import { createCustomSsoTrafficGate } from "./traffic-gate";

export function createCustomSsoApplication(deps: CustomSsoDeps & {
  access: CustomSsoAccess;
}) {
  const trafficGate = createCustomSsoTrafficGate({ gate: deps.traffic });
  const redirectUrls = createSsoRedirectUrlValidator({ logger: deps.logger });
  const sessions = createCustomSsoSessionKernelAdapter({
    ...deps,
    subjectDelivery: createCustomSsoSubjectDelivery({ projection: deps.subjectProjection }),
  });
  const operationDeps = { authorizationGrants: sessions, clients: deps.clients, trafficGate };

  async function authorizeLocalSession(token: string, clientCode: string) {
    try {
      await trafficGate.assertSessionUseAllowed(clientCode);
    }
    catch (error) {
      if (error instanceof AuthzUnauthorizedError)
        return await sessions.authorizeLocalSession(token, clientCode, true);
      throw error;
    }
    return await sessions.authorizeLocalSession(token, clientCode);
  }

  async function resolvePublicAuthentication(token: string, clientCode: string) {
    try {
      await trafficGate.assertSessionUseAllowed(clientCode);
    }
    catch (error) {
      if (error instanceof AuthzUnauthorizedError)
        return await sessions.resolvePublicAuthentication(token, clientCode, true);
      throw error;
    }
    return await sessions.resolvePublicAuthentication(token, clientCode);
  }

  return {
    authorize: createAuthorizeSsoUseCase({ ...operationDeps, redirectUrls }),
    checkLoginContinuation: createCheckSsoLoginContinuation({
      clients: deps.clients,
      principalSessions: sessions,
      redirectUrls,
      trafficGate,
    }),
    exchangeCode: createExchangeSsoCodeUseCase({
      ...operationDeps,
      clientCredentials: createCustomSsoClientSecretVerifier({ repository: deps.clientSecrets, secrets: deps.secrets }),
    }),
    completeCallback: createCompleteSsoCallbackUseCase(operationDeps),
    authorizeLocalSession,
    resolvePublicAuthentication,
    logout: {
      async execute(input: { sessionToken?: string }) {
        await sessions.logout(input.sessionToken);
        return true as const;
      },
    },
  };
}
