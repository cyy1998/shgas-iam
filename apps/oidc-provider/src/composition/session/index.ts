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
      namespace: env.SESSION_KERNEL_NAMESPACE,
      principalIdleTtlSeconds: env.SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS,
      principalAbsoluteTtlSeconds: env.SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS,
      defaultPrincipalTtlSeconds: env.OIDC_GLOBAL_SESSION_TTL_SECONDS,
      tombstoneTtlSeconds: env.SESSION_KERNEL_TOMBSTONE_TTL_SECONDS,
      tombstoneGraceSeconds: env.SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS,
      lookupHmacCurrentId: env.SESSION_LOOKUP_HMAC_CURRENT_ID,
      lookupHmacCurrentSecret: env.SESSION_LOOKUP_HMAC_CURRENT_SECRET,
      lookupHmacPreviousId: env.SESSION_LOOKUP_HMAC_PREVIOUS_ID,
      lookupHmacPreviousSecret: env.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET,
      nodeEnv: env.NODE_ENV,
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
    cookieName: deps.env.OIDC_GLOBAL_SESSION_COOKIE,
    clock: { now: Date.now },
  });

  return {
    kernel,
    oidcSession: adapter,
  };
}

export type OidcProviderSession = ReturnType<typeof createOidcProviderSession>;
