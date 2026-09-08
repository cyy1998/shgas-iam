import type {
  SessionKernelRedis,
  SessionKernelValidationHooks,
} from "@iam/session-kernel";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcSessionKernelAccountReader } from "../../session/oidc-session-kernel.adapter.ts";
import type { ProviderSessionStateRedis } from "../../session/provider-session-state.store.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { randomUUID } from "node:crypto";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
} from "@iam/api-core/subject-access";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import {
  createSessionKernel,
  createSessionKernelConfigFromEnv,
} from "@iam/session-kernel";
import {
  createOidcSessionKernelCleanupAdapter,
} from "../../session/oidc-session-kernel.adapter.ts";
import { createProviderSessionStateStore } from "../../session/provider-session-state.store.ts";
import { createOidcSessionOperations } from "./session-operations.ts";

export interface CreateOidcProviderSessionDeps {
  env: OidcProviderEnv;
  redis: Redis;
  logger: OidcLogger;
  repositories: { account: OidcSessionKernelAccountReader };
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

function createOidcProviderSubjectAccess(
  deps: Pick<CreateOidcProviderSessionDeps, "redis">,
) {
  return createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: { uuid: randomUUID },
    store: createRedisSubjectAccessStore({
      redis: deps.redis,
    }),
  });
}

function createOidcProviderSessionDependencies(deps: CreateOidcProviderSessionDeps) {
  const providerSessionState = createProviderSessionStateStore(
    deps.redis as unknown as ProviderSessionStateRedis,
  );
  const validationHooks: SessionKernelValidationHooks = {
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

  const customSsoCleanup = createCustomSsoCleanup({ redis: deps.redis });
  return {
    providerSessionState,
    kernelDependencies: {
      redis: deps.redis as SessionKernelRedis,
      config: createOidcProviderSessionKernelConfig(deps.env),
      cleanupAdapters: [
        ...createOidcSessionKernelCleanupAdapter({
          providerSessionState,
          redis: deps.redis,
        }),
        customSsoCleanup,
      ],
      validationHooks,
      logger: deps.logger,
      sourceApp: LoggerSourceApp.OidcProvider,
    },
  };
}

export function createOidcProviderSession(deps: CreateOidcProviderSessionDeps) {
  const subjectAccess = createOidcProviderSubjectAccess(deps);
  const { kernelDependencies, providerSessionState } = createOidcProviderSessionDependencies(deps);
  const kernel = createSessionKernel(kernelDependencies);
  const operations = createSubjectAccessOperations({
    barrier: subjectAccess,
    revocation: createSubjectAccessSessionRevocation(kernel),
  });
  const sessions = createOidcSessionOperations({
    kernel,
    providerSessionState,
    logger: deps.logger,
    accounts: deps.repositories.account,
    clients: deps.stores.clientRuntime,
    cookieName: deps.env.oidc.globalSessionCookie,
  });
  return { kernel, operations, sessions, providerSessionState, subjectAccess };
}

export type OidcProviderSession = ReturnType<typeof createOidcProviderSession>;
