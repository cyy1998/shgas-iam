import type {
  SessionKernelRedis,
  SessionKernelValidationHooks,
} from "@iam/api-core/session/kernel";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcSessionKernelRedis } from "../../session/oidc-session-kernel.adapter.ts";
import type { OidcProviderRepositories } from "../repositories/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createSessionKernel,
  createSessionKernelConfigFromEnv,
} from "@iam/api-core/session/kernel";
import {
  createOidcSessionKernelAdapter,
  createOidcSessionKernelCleanupAdapter,
} from "../../session/oidc-session-kernel.adapter.ts";

export interface CreateOidcProviderSessionDeps {
  env: OidcProviderEnv;
  redis: Redis;
  logger: OidcLogger;
  repositories: Pick<OidcProviderRepositories, "account">;
  stores: Pick<OidcProviderStores, "clientRuntime">;
}

export function createOidcProviderSessionKernelConfig(env: OidcProviderEnv) {
  return {
    ...createSessionKernelConfigFromEnv({
      namespace: env.sessionKernel.namespace,
      principalIdleTtlSeconds: env.sessionKernel.principalIdleTtlSeconds,
      principalAbsoluteTtlSeconds: env.sessionKernel.principalAbsoluteTtlSeconds,
      defaultPrincipalTtlSeconds: env.oidc.globalSessionTtlSeconds,
      tombstoneTtlSeconds: env.sessionKernel.tombstoneTtlSeconds,
      tombstoneGraceSeconds: env.sessionKernel.tombstoneGraceSeconds,
      lookupHmacCurrentId: env.sessionKernel.lookupHmacCurrentId,
      lookupHmacCurrentSecret: env.sessionKernel.lookupHmacCurrentSecret,
      lookupHmacPreviousId: env.sessionKernel.lookupHmacPreviousId,
      lookupHmacPreviousSecret: env.sessionKernel.lookupHmacPreviousSecret,
      nodeEnv: env.nodeEnv,
    }),
    clock: { now: Date.now },
  };
}

export function createOidcProviderSession(deps: CreateOidcProviderSessionDeps) {
  const validationHooks: SessionKernelValidationHooks = {
    async validatePrincipal(session) {
      const userId = Number.parseInt(session.principal.subjectId, 10);
      if (!Number.isSafeInteger(userId))
        return { ok: false, reason: "user_deleted", message: "invalid user subject" };
      return await deps.repositories.account.findById(userId)
        ? { ok: true }
        : { ok: false, reason: "user_disabled", message: "OIDC principal is unavailable" };
    },
    async validateClient(object) {
      if (!object.clientCode)
        return { ok: true };
      return await deps.stores.clientRuntime.findRuntime(object.clientCode)
        ? { ok: true }
        : { ok: false, reason: "client_disabled", message: "OIDC client is unavailable" };
    },
    async validateProtocolVersion(object) {
      if (!object.clientCode)
        return { ok: true };
      const expected = typeof object.metadata?.oidcConfigVersion === "number"
        ? object.metadata.oidcConfigVersion
        : undefined;
      if (expected === undefined)
        return { ok: false, reason: "client_config_changed", message: "OIDC config version is missing" };
      const current = await deps.stores.clientRuntime.findActiveVersion(object.clientCode);
      return current === expected
        ? { ok: true }
        : { ok: false, reason: "client_config_changed", message: "OIDC config version changed" };
    },
  };

  const kernel = createSessionKernel({
    redis: deps.redis as SessionKernelRedis,
    config: createOidcProviderSessionKernelConfig(deps.env),
    cleanupAdapters: createOidcSessionKernelCleanupAdapter({ redis: deps.redis }),
    validationHooks,
    logger: deps.logger,
    sourceApp: LoggerSourceApp.OidcProvider,
  });

  const adapter = createOidcSessionKernelAdapter({
    kernel,
    redis: deps.redis as unknown as OidcSessionKernelRedis,
    logger: deps.logger,
    accounts: deps.repositories.account,
    clients: deps.stores.clientRuntime,
    cookieName: deps.env.oidc.globalSessionCookie,
    clock: { now: Date.now },
  });

  return {
    kernel,
    oidcSession: adapter,
  };
}

export type OidcProviderSession = ReturnType<typeof createOidcProviderSession>;
