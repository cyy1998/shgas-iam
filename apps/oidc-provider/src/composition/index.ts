import type { DbClient } from "@iam/db";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { SigningKey } from "../security/signing-keys.ts";
import db, { closeDb } from "@iam/db";
import { createClientProtocolArtifactCleanup } from "../commands/client-protocol-artifact-cleanup.ts";
import { createLogger } from "../lib/logger.ts";
import { createProviderRedis } from "../lib/redis.ts";
import { loadSigningKeys } from "../security/signing-keys.ts";
import { createOidcHttpServer } from "./http/index.ts";
import { createOidcProviderRuntime } from "./provider/index.ts";
import { createOidcProviderRepositories } from "./repositories/index.ts";
import { createOidcProviderSecurity } from "./security/index.ts";
import { createOidcProviderSession } from "./session/index.ts";
import { createOidcProviderShutdown } from "./shutdown.ts";
import { createOidcProviderStores } from "./stores/index.ts";
import { createOidcProviderWorkers } from "./workers/index.ts";

export interface CreateOidcProviderCompositionOptions {
  env: OidcProviderEnv;
  logger?: OidcLogger;
  redis?: Redis;
  dbClient?: DbClient;
  signingKeys?: {
    current: SigningKey;
    previous?: SigningKey;
  };
}

export async function createOidcProviderComposition(options: CreateOidcProviderCompositionOptions) {
  const logger = options.logger ?? createLogger(options.env);
  const redis = options.redis ?? createProviderRedis(options.env);
  const signingKeys = options.signingKeys
    ?? await loadSigningKeys(options.env.oidc.currentJwkJson, options.env.oidc.previousJwkJson);
  const dbClient = options.dbClient ?? db;
  const repositories = createOidcProviderRepositories(dbClient);
  const stores = createOidcProviderStores({ env: options.env, redis, repositories });
  const session = createOidcProviderSession({ env: options.env, redis, logger, repositories, stores });
  const security = createOidcProviderSecurity({ env: options.env, repositories, stores });
  const providerRuntime = createOidcProviderRuntime({
    env: options.env,
    logger,
    redis,
    db: dbClient,
    signingKeys,
    repositories,
    security,
    session,
    stores,
  });
  const server = createOidcHttpServer({
    provider: providerRuntime.provider,
    interactions: providerRuntime.interactions,
    env: options.env,
    logger,
    health: redis,
  });
  const workers = createOidcProviderWorkers({ redis, logger, stores, session });
  const shutdown = createOidcProviderShutdown({
    clientInvalidationSubscriber: workers.clientInvalidationSubscriber,
    closeDatabase: closeDb,
    logger,
    redis,
    server,
  });

  return {
    logger,
    server,
    shutdown,
  };
}

export type OidcProviderComposition = Awaited<ReturnType<typeof createOidcProviderComposition>>;

export function createOidcProtocolArtifactCommandComposition(
  options: Pick<CreateOidcProviderCompositionOptions, "env" | "logger" | "redis" | "dbClient">,
) {
  const logger = options.logger ?? createLogger(options.env);
  const redis = options.redis ?? createProviderRedis(options.env);
  const dbClient = options.dbClient ?? db;
  const repositories = createOidcProviderRepositories(dbClient);
  const stores = createOidcProviderStores({ env: options.env, redis, repositories });
  const session = createOidcProviderSession({
    env: options.env,
    redis,
    logger,
    repositories,
    stores,
  });
  return {
    cleanup: createClientProtocolArtifactCleanup({
      kernel: session.kernel,
      protocolObjects: stores.protocolObjects,
      providerSessionBindings: session.providerSessionState,
    }),
    logger,
    async shutdown() {
      await Promise.allSettled([redis.quit(), closeDb({ timeoutSeconds: 1 })]);
    },
  };
}
