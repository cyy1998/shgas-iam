import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type { CreateResult, SessionKernel } from "@iam/session-kernel";
import { randomUUID } from "node:crypto";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import { createClientService } from "@admin-api/services/client/client.service";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { createFakePasswordHasher, createFakeRandom } from "@admin-api/test/fakes";
import { createClientRuntimeSnapshotModule } from "@iam/api-core/client-runtime-snapshot";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, CustomSsoClientMode, OidcClientType, OidcScope, OidcTokenEndpointAuthMethod, SubjectClaim } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { createSessionKernel } from "@iam/session-kernel";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createCustomSsoClientRuntimeReader, createCustomSsoClientRuntimeSnapshotAdapter } from "../../../api/src/services/client/custom-sso-client-runtime.reader";
import { createCustomSsoClientRepository } from "../../../api/src/services/client/custom-sso-client.repository";
import { createOidcClientRepository } from "../../../oidc-provider/src/repositories/client.repository";
import { createOidcClientRuntimeSnapshotAdapter, createOidcClientRuntimeStore } from "../../../oidc-provider/src/stores/client-runtime.store";
import { createAdminApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createAdminApiRedisTestHarness } from "../redis/redis-test-harness";

let postgres: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
let redis: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
beforeAll(async () => {
  postgres = await createAdminApiPostgresTestHarness();
  redis = await createAdminApiRedisTestHarness({ resourceEnvName: "IAM_API_CORE_TEST_REDIS_URL" });
});
afterAll(async () => {
  await postgres?.close();
  await redis?.close();
});

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixture() {
  const scope = await redis.createScope();
  const code = scope.clientCode("client");
  await postgres.db.insert(clients).values({
    clientCode: code,
    clientName: code,
    clientSecret: "generic-secret",
    status: ClientStatus.Enable,
    extAttributes: {},
    oidcEnabled: true,
    oidcConfigVersion: 1,
    oidcConfig: { clientType: OidcClientType.Public, redirectUris: ["https://client.example/callback"], postLogoutRedirectUris: [], allowedScopes: [OidcScope.OpenId], tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None },
    customSsoEnabled: true,
    customSsoConfigVersion: 7,
    customSsoConfig: { mode: CustomSsoClientMode.Gateway, orcas: { enabled: false }, subjectClaims: [SubjectClaim.SubjectIdentifier], validRedirectUrls: ["https://client.example/*"] },
  });
  const kernel = createSessionKernel({ redis: scope.redis, config: {
    namespace: `${scope.clientCode("kernel")}:`,
    principalIdleTtlMs: 300_000,
    principalAbsoluteTtlMs: 300_000,
    lookupHmacKeys: { current: { id: "test", secret: "test-only-key-material-32-bytes-long" } },
  } });
  const snapshots = createClientRuntimeSnapshotModule({ redis: scope.redis, adapters: [
    createOidcClientRuntimeSnapshotAdapter({ repository: createOidcClientRepository(postgres.db), cacheTtlSeconds: 30 }),
    createCustomSsoClientRuntimeSnapshotAdapter({ repository: createCustomSsoClientRepository(postgres.db) }),
  ] });
  const oidc = createOidcClientRuntimeStore(snapshots.reader("oidc"));
  const custom = createCustomSsoClientRuntimeReader(snapshots.reader("custom-sso"));
  const logger = { logPreparationFailure() {}, logUserRevocation() {}, logClientProtocolRevocation() {}, logClientAllProtocolsRevocation() {} };
  const adapter = createAdminSessionRevocationPort({ sessionKernel: kernel, logger });
  type ProtocolInput = Parameters<AdminSessionRevocationPort["revokeClientProtocol"]>[0];
  const delayed: Array<{ input: ProtocolInput; reached: ReturnType<typeof latch>; resume: ReturnType<typeof latch> }> = [];
  let nextDelay: { reached: ReturnType<typeof latch>; resume: ReturnType<typeof latch> } | undefined;
  const uow = createAdminApiUnitOfWork({ db: postgres.db, logger: { warn() {}, error() {} }, clock: { nowDate: () => new Date() }, userProfileJobProducer: { enqueueRebuildJobs: async () => ({ enqueued: 0, jobIds: [] }) } });
  const service = createClientService({
    clientRepository: createClientRepository(postgres.db),
    clientRuntimeInvalidation: snapshots,
    clientMutationLogger: { error() {} },
    clientCache: { async invalidateClient() {}, async invalidateUpdatedClient() {} },
    sessionRevocation: {
      async revokeClientProtocol(input) {
        const delay = nextDelay;
        nextDelay = undefined;
        if (delay) {
          delayed.push({ input, ...delay });
          delay.reached.release();
          await delay.resume.promise;
        }
        return await adapter.revokeClientProtocol(input);
      },
      revokeClientAllProtocols: adapter.revokeClientAllProtocols,
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow: mapUnitOfWork(uow, tx => ({ clientRepository: tx.repositories.client, auditService: tx.auditService })),
  });
  return { scope, code, kernel, service, adapter, oidc, custom, delayed, delayNext() {
    const delay = { reached: latch(), resume: latch() };
    nextDelay = delay;
    return delay;
  } };
}

function created<T>(result: CreateResult<T>) {
  if (result.status !== "created")
    throw new Error(`fixture not created: ${result.status}`);
  return result.value;
}

async function issue(kernel: SessionKernel, clientCode: string, protocol: "oidc" | "custom-sso", version: number) {
  const principal = created(await kernel.createPrincipalSession(randomUUID(), { subjectContext: "test-context" }));
  const token = randomUUID();
  const credential = created(await kernel.issueCredential({
    principalSessionId: principal.principalSessionId,
    protocol,
    clientCode,
    credentialType: "access_token",
    externalToken: token,
    metadata: protocol === "oidc" ? { oidcConfigVersion: version } : { configVersion: version },
  }));
  return { credential, principal, token };
}

async function exists(kernel: SessionKernel, value: Awaited<ReturnType<typeof issue>>) {
  const credential = await kernel.resolveCredential(value.token, { protocol: value.credential.protocol, credentialType: "access_token" });
  const principal = await kernel.resolvePrincipalSessionById(value.principal.principalSessionId);
  expect(credential.status).toBe("resolved");
  expect(principal.status).toBe("resolved");
}

describe("committed Client configuration revocation with PostgreSQL and Redis", () => {
  for (const protocol of ["oidc", "custom-sso"] as const) {
    for (const reverse of [false, true]) {
      test(`${protocol}: ${reverse ? "out-of-order" : "late"} committed commands preserve boundary and future generations`, async () => {
        const f = await fixture();
        const tasks: Promise<unknown>[] = [];
        const releases: Array<() => void> = [];
        try {
          const base = protocol === "oidc" ? 1 : 7;
          const old = await issue(f.kernel, f.code, protocol, base);
          const otherUser = await issue(f.kernel, f.code, protocol, base);
          const otherClient = await issue(f.kernel, f.scope.clientCode("other"), protocol, base);
          // Prime the real runtime cache before the authoritative change.
          if (protocol === "oidc")
            await f.oidc.findRuntime(f.code);
          else await f.custom.findRuntimeRecord(f.code);
          const first = f.delayNext();
          releases.push(first.resume.release);
          const firstTask = protocol === "oidc" ? f.service.disableClientOidc(f.code) : f.service.disableClientCustomSso(f.code);
          tasks.push(firstTask);
          await first.reached.promise;
          const committed = await createClientRepository(postgres.db).getClientByCode(f.code);
          expect(protocol === "oidc" ? committed?.oidcConfigVersion : committed?.customSsoConfigVersion).toBe(base + 1);
          expect(await (protocol === "oidc" ? f.oidc.findRuntime(f.code) : f.custom.findRuntimeRecord(f.code))).toBeNull();
          const boundary = await issue(f.kernel, f.code, protocol, base + 1);
          const second = f.delayNext();
          releases.push(second.resume.release);
          const secondTask = protocol === "oidc" ? f.service.enableClientOidc(f.code) : f.service.enableClientCustomSso(f.code);
          tasks.push(secondTask);
          await second.reached.promise;
          const enabled = protocol === "oidc" ? await f.oidc.findRuntime(f.code) : await f.custom.findRuntimeRecord(f.code);
          expect(enabled).not.toBeNull();
          const current = await issue(f.kernel, f.code, protocol, base + 2);
          const future = await issue(f.kernel, f.code, protocol, base + 3);
          expect(f.delayed.map(item => item.input.committedVersion)).toEqual([base + 1, base + 2]);
          // Both original commands can arrive out of order after propagation and issuance.
          if (reverse) {
            second.resume.release();
            await secondTask;
          }
          first.resume.release();
          await firstTask;
          if (!reverse)
            await exists(f.kernel, boundary);
          await exists(f.kernel, current);
          await exists(f.kernel, future);
          for (const target of [old, otherUser]) {
            const result = await f.kernel.resolveCredential(target.token, { protocol, credentialType: "access_token" });
            expect(result.status).toBe("revoked");
            const root = await f.kernel.resolvePrincipalSessionById(target.principal.principalSessionId);
            expect(root.status).toBe("resolved");
          }
          second.resume.release();
          await secondTask;
          const revokedBoundary = await f.kernel.resolveCredential(boundary.token, { protocol, credentialType: "access_token" });
          expect(revokedBoundary.status).toBe("revoked");
          // Replay the older fixed command after the newer command completed.
          await f.adapter.revokeClientProtocol(f.delayed[0]!.input);
          await exists(f.kernel, current);
          await exists(f.kernel, future);
          await exists(f.kernel, otherClient);
          const noOp = protocol === "oidc" ? await f.service.enableClientOidc(f.code) : await f.service.enableClientCustomSso(f.code);
          expect(noOp.changed).toBe(false);
          const after = await createClientRepository(postgres.db).getClientByCode(f.code);
          expect(protocol === "oidc" ? after?.oidcConfigVersion : after?.customSsoConfigVersion).toBe(base + 2);
          await exists(f.kernel, current);
        }
        finally {
          for (const release of releases) release();
          await Promise.allSettled(tasks);
          await f.scope.close();
        }
      }, 30_000);
    }
  }

  for (const action of ["disable", "delete"] as const) {
    test(`${action} fixes separate protocol boundaries and preserves non-target roots`, async () => {
      const f = await fixture();
      try {
        const oldOidc = await issue(f.kernel, f.code, "oidc", 1);
        const oldCustom = await issue(f.kernel, f.code, "custom-sso", 7);
        const currentOidc = await issue(f.kernel, f.code, "oidc", 2);
        const currentCustom = await issue(f.kernel, f.code, "custom-sso", 8);
        const other = await issue(f.kernel, f.scope.clientCode("control"), "oidc", 1);
        if (action === "disable")
          await f.service.updateClientStatus(f.code, ClientStatus.Disable);
        else await f.service.deleteClient(f.code);
        for (const target of [oldOidc, oldCustom]) {
          const result = await f.kernel.resolveCredential(target.token, { protocol: target.credential.protocol, credentialType: "access_token" });
          expect(result.status).toBe("revoked");
          expect((await f.kernel.resolvePrincipalSessionById(target.principal.principalSessionId)).status).toBe("resolved");
        }
        await exists(f.kernel, currentOidc);
        await exists(f.kernel, currentCustom);
        await exists(f.kernel, other);
        if (action === "disable") {
          expect((await f.service.updateClientStatus(f.code, ClientStatus.Disable)).changed).toBe(false);
          await exists(f.kernel, currentOidc);
          await exists(f.kernel, currentCustom);
        }
      }
      finally {
        await f.scope.close();
      }
    }, 30_000);
  }
});
