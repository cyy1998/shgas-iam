import { randomUUID } from "node:crypto";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import { createAuditLogWriter, createAuditRepository } from "@iam/db/audit";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { relations } from "@iam/db/relations";
import { createApplicationAdmissionEvaluator } from "@iam/documents/user/admission";
import {
  createSubjectFactsLoggerObservability,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/documents/user/subject-facts";
import { createOidcClientAuthRateLimiter, createOidcSigningKeys } from "@iam/oidc";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import { createOwnedRedisClient } from "@iam/runtime/redis/connection";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore } from "@iam/subject-access/redis";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Context } from "hono";
import postgres from "postgres";
import { type Env, parseSsoApiEnv } from "../env";
import { createCustomSsoComposition } from "./custom-sso";
import { createOidcComposition } from "./oidc";
import { createProtocolOperations } from "./sessions";

export async function createSsoApiComposition(options: { env?: Env; logger?: ReturnType<typeof createLogger> } = {}) {
  const env = options.env ?? parseSsoApiEnv(process.env);
  const logger =
    options.logger ??
    createLogger({
      nodeEnv: env.nodeEnv,
      logLevel: env.log.level,
      logFormat: env.log.format,
      sourceApp: LoggerSourceApp.SsoApi,
    });
  const signing = createOidcSigningKeys(env.oidc);
  const pg = postgres(env.databaseUrl);
  const db = drizzle({ client: pg, relations });
  const redis = createOwnedRedisClient(env.redis);
  async function close() {
    redis.disconnect();
    await pg.end({ timeout: 5 });
  }

  try {
    const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
      redis,
      ...env.sessionKernel,
      assertOperationActive: requireSubjectAccessOperation,
    });
    const operations = createProtocolOperations(
      kernel,
      createSubjectAccessBarrier({
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
        store: createRedisSubjectAccessStore({ redis }),
      }),
    );
    const subjectFacts = createSubjectFactsReader({
      db,
      cache: createSubjectFactsRedisCache(redis),
      observability: createSubjectFactsLoggerObservability(logger),
    });
    const snapshots = createClientSnapshots({ redis, source: createClientSnapshotRepository(db) });
    const credentials = createClientSecretAuthenticator(snapshots.credential);
    const admission = createApplicationAdmissionEvaluator(db);
    const audit = createAuditLogWriter({ sourceApp: "sso-api", auditRepository: createAuditRepository(db) });

    const shared = { kernel, clients: snapshots.client, admission, redis };
    const transport = {
      operations,
      subjectFacts,
      logger,
      loginEndpoint: env.sso.loginEndpoint,
      wechatQrEnabled: env.wechatQrEnabled,
    };
    const customSso = createCustomSsoComposition({
      ...transport,
      authorization: {
        ...shared,
        namespace: env.sessionKernel.namespace,
        codeTtlSeconds: env.customSso.authCodeTtlSeconds,
        continuationTtlSeconds: env.customSso.authCodeTtlSeconds,
      },
      access: {
        credentials,
        tokenTtlSeconds: env.customSso.tokenTtlSeconds,
        business: { audit, logger },
        managed: { audit, logger },
      },
      endpoints: {
        authorizationEndpoint: env.sso.authorizationEndpoint,
        logoutEndpoint: env.sso.logoutEndpoint,
        thirdPartyOAEndpoint: env.sso.thirdPartyOAEndpoint,
        ssoInternalOrigin: env.sso.internalOrigin,
        ssoExternalOrigin: env.sso.externalOrigin,
      },
      retryAfterSeconds: env.customSso.projectionRetryAfterSeconds,
    });
    const oidc = createOidcComposition({
      ...transport,
      authorization: {
        ...shared,
        namespace: env.oidc.namespace,
        codeTtlSeconds: env.oidc.authorizationCodeTtlSeconds,
        continuationTtlSeconds: env.oidc.continuationTtlSeconds,
      },
      issuers: { internal: `${env.sso.internalOrigin}/oidc`, external: `${env.sso.externalOrigin}/oidc` },
      secureCookies: env.oidc.cookieSecure,
      trustProxy: env.oidc.trustProxy,
      clientAuthRateLimiter: createOidcClientAuthRateLimiter({ redis, namespace: env.oidc.namespace }),
      tokens: { credentials, signing, tokenTtlSeconds: env.oidc.tokenTtlSeconds },
      logout: { verification: signing, confirmationTtlSeconds: env.oidc.logoutConfirmationTtlSeconds },
    });

    const health = createRouter();
    const redisHealth = async (c: Context) => {
      try {
        await redis.ping();
        return c.json({ status: "ok" });
      } catch {
        return c.json({ status: "unavailable" }, 503);
      }
    };
    health.get("/health", redisHealth);
    health.get("/oidc/health", redisHealth);
    health.get("/ready", async (c) => {
      try {
        await Promise.all([redis.ping(), db.execute(sql`SELECT 1`)]);
        return c.json({ status: "ok" });
      } catch {
        return c.json({ status: "unavailable" }, 503);
      }
    });
    const routes: CreateAppOptions["routes"] = {
      "./src/routes/health/health.index.ts": { default: health },
      "./src/routes/sso/sso.index.ts": { default: customSso.router },
      "./src/routes/oidc/oidc.index.ts": { default: oidc.router },
    };
    return { env, logger, routes, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "SSO API startup and cleanup failed");
    }
    throw error;
  }
}
