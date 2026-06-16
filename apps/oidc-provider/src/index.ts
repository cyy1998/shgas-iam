import { SystemLogEvent } from "@iam/api-core/logger";
import { closeDb } from "@iam/db";
import { createOidcHttpServer, createOidcProvider } from "./app.ts";
import { parseOidcProviderEnv } from "./env.ts";
import { startClientInvalidationSubscriber } from "./invalidation/client-invalidation.ts";
import { createLogger } from "./lib/logger.ts";
import { createProviderRedis } from "./lib/redis.ts";
import { loadSigningKeys } from "./security/signing-keys.ts";

async function main() {
  const env = parseOidcProviderEnv(process.env);
  const logger = createLogger(env);
  const redis = createProviderRedis(env);
  const signingKeys = await loadSigningKeys(env.OIDC_CURRENT_JWK_JSON, env.OIDC_PREVIOUS_JWK_JSON);
  const runtime = createOidcProvider({ env, redis, logger, signingKeys });
  const server = createOidcHttpServer(runtime, redis);
  const invalidationSubscriber = startClientInvalidationSubscriber(redis, logger);

  server.listen(env.PORT, () => {
    logger.info({
      event: SystemLogEvent.OidcProviderStarted,
      sourceApp: "iam-oidc-provider",
      issuer: env.OIDC_ISSUER,
      port: env.PORT,
    }, "OIDC provider listening");
  });

  async function shutdown(signal: string) {
    logger.info({
      event: SystemLogEvent.OidcProviderStopping,
      sourceApp: "iam-oidc-provider",
      signal,
    }, "OIDC provider shutting down");
    server.close();
    await Promise.allSettled([invalidationSubscriber.quit(), redis.quit(), closeDb()]);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
