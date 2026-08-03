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
  | "tokens">;
}

export function createOidcProviderRuntime(deps: CreateOidcProviderRuntimeDeps) {
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
    interactionPolicy: createIamInteractionPolicy(deps.session.oidcSession, deps.session.oidcSession),
    clientAuthRateLimiter: deps.security.clientAuthRateLimiter,
    clientSecretVerifier: deps.security.clientSecretVerifier,
    oidcSession: deps.session.oidcSession,
  });
  const interactions = createOidcInteractionHandler({
    provider,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    returnHandles: deps.session.oidcSession,
    env: deps.env,
  });

  return {
    claims,
    provider,
    interactions,
  };
}

export type OidcProviderRuntime = ReturnType<typeof createOidcProviderRuntime>;
