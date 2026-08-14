import type { DbClient } from "@iam/db";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { SigningKey } from "../../security/signing-keys.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderSecurity } from "../security/index.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { createClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  createSubjectFactsLoggerObservability,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model/subject-facts";
import { createOidcInteractionHandler } from "../../interaction/handler.ts";
import { createIamInteractionPolicy } from "../../interaction/policy.ts";
import { createOidcClaimsAdapter } from "../../provider/claims.ts";
import {
  createOidcClientTrafficGate,
  registerOidcClientTrafficGate,
} from "../../provider/client-traffic-gate.ts";
import { createOidcProvider } from "../../provider/create-provider.ts";
import { createOidcAdapterFactory } from "../../storage/redis-adapter.ts";

export interface CreateOidcProviderRuntimeDeps {
  env: OidcProviderEnv;
  logger: OidcLogger;
  redis: Redis;
  db: DbClient;
  signingKeys: {
    current: SigningKey;
    previous?: SigningKey;
  };
  repositories: Pick<OidcProviderRepositories, "account">;
  security: Pick<OidcProviderSecurity, "clientAuthRateLimiter" | "clientSecretVerifier">;
  session: Pick<OidcProviderSession, "oidcSession" | "subjectAccess">;
  stores: Pick<OidcProviderStores, | "clientRuntime"
  | "clientTrafficGate"
  | "tokens">;
}

export function createOidcProviderRuntime(deps: CreateOidcProviderRuntimeDeps) {
  const trafficGate = createOidcClientTrafficGate({ gate: deps.stores.clientTrafficGate });
  const subjectFacts = createSubjectFactsReader({
    db: deps.db,
    cache: createSubjectFactsRedisCache(deps.redis),
    observability: createSubjectFactsLoggerObservability(deps.logger),
  });
  const projection = createClientSubjectProjectionService({
    subjectAccess: deps.session.subjectAccess,
    subjectFacts,
    authorizationFreshness: subjectFacts,
  });
  const claims = createOidcClaimsAdapter({
    accounts: deps.repositories.account,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    projection,
    providerSessions: deps.session.oidcSession,
    tokens: deps.session.oidcSession,
  });
  const adapter = createOidcAdapterFactory(deps.redis, {
    claims,
    clients: deps.stores.clientRuntime,
    clientVersions: deps.stores.clientRuntime,
    oidcSession: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    tokens: deps.stores.tokens,
  });
  const provider = createOidcProvider({
    env: deps.env,
    logger: deps.logger,
    signingKeys: deps.signingKeys,
    adapter,
    claims,
    interactionPolicy: createIamInteractionPolicy(
      deps.session.oidcSession,
      deps.session.oidcSession,
      trafficGate,
    ),
    clientAuthRateLimiter: deps.security.clientAuthRateLimiter,
    clientSecretVerifier: deps.security.clientSecretVerifier,
    oidcSession: deps.session.oidcSession,
    trafficGate,
  });
  registerOidcClientTrafficGate(provider, trafficGate);
  const interactions = createOidcInteractionHandler({
    provider,
    interactionArtifacts: {
      async find(interactionUid) {
        const interaction = await provider.Interaction.find(interactionUid);
        if (typeof interaction !== "object" || interaction === null)
          return null;
        const uid = Reflect.get(interaction, "uid");
        const params = Reflect.get(interaction, "params");
        const prompt = Reflect.get(interaction, "prompt");
        if (typeof params !== "object" || params === null
          || typeof prompt !== "object" || prompt === null) {
          return null;
        }
        const clientId = Reflect.get(params, "client_id");
        const promptName = Reflect.get(prompt, "name");
        if (typeof uid !== "string"
          || typeof clientId !== "string"
          || typeof promptName !== "string") {
          return null;
        }
        return {
          clientId,
          promptName,
          uid,
        };
      },
    },
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    returnHandles: deps.session.oidcSession,
    trafficGate,
    env: deps.env,
  });

  return {
    claims,
    provider,
    interactions,
  };
}

export type OidcProviderRuntime = ReturnType<typeof createOidcProviderRuntime>;
