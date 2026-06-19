import type { DbClient } from "@iam/db";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { SigningKey } from "../security/signing-keys.ts";
import { SystemLogEvent } from "@iam/api-core/logger";
import { closeDb } from "@iam/db";
import { createLogger } from "../lib/logger.ts";
import { createProviderRedis } from "../lib/redis.ts";
import { loadSigningKeys } from "../security/signing-keys.ts";
import { createOidcHttpServer } from "./http/index.ts";
import { createOidcProviderRuntime } from "./provider/index.ts";
import { createOidcProviderRepositories } from "./repositories/index.ts";
import { createOidcProviderServices } from "./services/index.ts";
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
    ?? await loadSigningKeys(options.env.OIDC_CURRENT_JWK_JSON, options.env.OIDC_PREVIOUS_JWK_JSON);
  const repositories = createOidcProviderRepositories(options.dbClient);
  const stores = createOidcProviderStores({ env: options.env, redis, repositories });
  const services = createOidcProviderServices({ env: options.env, repositories, stores });
  const providerRuntime = createOidcProviderRuntime({
    env: options.env,
    logger,
    redis,
    signingKeys,
    services,
    stores,
  });
  const server = createOidcHttpServer({
    provider: providerRuntime.provider,
    interactions: providerRuntime.interactions,
    env: options.env,
    logger,
    health: redis,
  });
  const workers = createOidcProviderWorkers({ redis, logger, stores });

  async function shutdown(signal: string) {
    logger.info({
      event: SystemLogEvent.OidcProviderStopping,
      signal,
    }, "OIDC provider shutting down");
    await Promise.allSettled([
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
      workers.clientInvalidationSubscriber.quit(),
      redis.quit(),
      closeDb(),
    ]);
  }

  return {
    env: options.env,
    logger,
    redis,
    repositories,
    stores,
    services,
    providerRuntime,
    provider: providerRuntime.provider,
    interactions: providerRuntime.interactions,
    server,
    workers,
    shutdown,
  };
}

export type OidcProviderComposition = Awaited<ReturnType<typeof createOidcProviderComposition>>;
