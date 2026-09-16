import type { ClientSsoConfig } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { randomUUID } from "node:crypto";
import { createAdminClientCache } from "@admin-api/composition/runtime/client-cache";
import { createClientSsoSnapshotManagement } from "@admin-api/composition/services/client-sso-snapshots";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createClientSsoRepository } from "@admin-api/services/client-sso/client-sso.repository";
import { createClientSsoService } from "@admin-api/services/client-sso/client-sso.service";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/api-core/client-snapshot/credentials";
import { createClientSnapshotMaintenance } from "@iam/api-core/client-snapshot/maintenance";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createUnitOfWork } from "@iam/api-core/uow";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope } from "@iam/contracts";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { auditLogs, clients } from "@iam/db/schema";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware } from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createAdminApiRedisTestHarness } from "../redis/redis-test-harness";

let pg: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
let resource: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
beforeAll(async () => {
  pg = await createAdminApiPostgresTestHarness();
  resource = await createAdminApiRedisTestHarness();
});
afterAll(async () => {
  await pg?.close();
  await resource?.close();
});
const logger = { error() {}, warn() {} };
const oidc = {
  protocol: ClientSsoProtocol.Oidc,
  clientType: OidcClientType.Confidential,
  redirectUris: ["https://client.example/callback"],
  postLogoutRedirectUris: [],
  allowedScopes: [OidcScope.OpenId],
} as const;
async function seed(code: string) {
  await pg.db.insert(clients).values({
    clientCode: code,
    clientName: "Snapshot candidate",
    clientSecret: `INTERNAL-SENTINEL-${code}`,
    status: ClientStatus.Enable,
    extAttributes: {},
    ssoSecret: "SSO-SENTINEL",
    ssoCredentialId: randomUUID(),
    ssoSecretUpdatedAt: new Date().toISOString(),
  });
}
async function failure(work: () => Promise<unknown>) {
  try {
    await work();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected failure");
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const managed = {
  protocol: ClientSsoProtocol.CustomSso,
  callbackType: ClientSsoCallbackType.Managed,
  validRedirectUrls: ["https://app.example/work/*"],
  subjectClaims: ["subjectIdentifier"],
  orcas: { enabled: true },
} satisfies ClientSsoConfig;

async function createManagedRestFixture() {
  const scope = await resource.createScope();
  try {
    const code = scope.clientCode("managed");
    await seed(code);
    const candidate = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: scope.redis }),
      db: pg.db,
      redis: scope.redis,
      logger,
    });
    const app = new Hono();
    addTestAdminAuthorizationMiddleware(app, ["iam:admin"]);
    app.onError(createErrorHandler({ ...logger, info() {} }));
    app.route("/admin", candidate.management.rest);
    const endpoint = `/admin/clients-sso/${encodeURIComponent(code)}`;
    const save = (config: unknown) => app.request(`${endpoint}/protocol`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
    return { scope, code, candidate, app, endpoint, save };
  }
  catch (error) {
    await scope.close();
    throw error;
  }
}

test("managed REST save persists and publishes the strict shape without exposing credentials", async () => {
  const { scope, code, candidate, app, endpoint, save } = await createManagedRestFixture();
  try {
    await candidate.snapshots.client.acquire(code);
    const response = await save(managed);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ data: { result: { ssoConfig: managed } } });
    expect(JSON.stringify(body)).not.toContain("SENTINEL");
    const detailResponse = await app.request(endpoint);
    const detail = await detailResponse.json();
    expect(detail).toMatchObject({ data: { ssoConfig: managed } });
    const persisted = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(persisted[0]!.ssoConfig).toEqual(managed);
    const published = await candidate.snapshots.client.acquire(code);
    expect(published).toMatchObject({ kind: "present", value: { ssoConfig: managed } });
    const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetCode, code));
    expect(JSON.stringify(audits)).not.toContain("SENTINEL");
  }
  finally { await scope.close(); }
});

test.each([
  ["managed callbackEndpoint string", { ...managed, callbackEndpoint: "https://obsolete.example/cb" }],
  ["managed callbackEndpoint null", { ...managed, callbackEndpoint: null }],
  ["business without callbackEndpoint", { ...managed, callbackType: ClientSsoCallbackType.Business, orcas: { enabled: false } }],
  ["business with enabled ORCAS", { ...managed, callbackType: ClientSsoCallbackType.Business, callbackEndpoint: "https://business.example/cb" }],
])("REST rejects %s without changing saved managed configuration", async (_name, invalid) => {
  const { scope, code, save } = await createManagedRestFixture();
  try {
    const saved = await save(managed);
    expect(saved.status).toBe(200);
    const before = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    const rejected = await save(invalid);
    expect(rejected.status).toBe(422);
    const after = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(after).toEqual(before);
  }
  finally { await scope.close(); }
});

test("managed to business and back preserves the existing SSO credential", async () => {
  const { scope, candidate, code, save } = await createManagedRestFixture();
  try {
    const originalSecret = await candidate.management.service.readSecret(code);
    const saved = await save(managed);
    expect(saved.status).toBe(200);
    const business = { ...managed, callbackType: ClientSsoCallbackType.Business, callbackEndpoint: "https://business.example/sso/callback", orcas: { enabled: false } };
    const switched = await save(business);
    expect(switched.status).toBe(200);
    const switchedBack = await save(managed);
    expect(switchedBack.status).toBe(200);
    const secret = await candidate.management.service.readSecret(code);
    expect(secret).toEqual(originalSecret);
    const persisted = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(persisted[0]!.ssoConfig).toEqual(managed);
  }
  finally { await scope.close(); }
});

test("managed Snapshot repair makes a fresh reader load the strict persisted shape", async () => {
  const { scope, code, candidate, save } = await createManagedRestFixture();
  try {
    const saved = await save(managed);
    expect(saved.status).toBe(200);
    await candidate.snapshots.client.acquire(code);
    await createClientSnapshotMaintenance(scope.redis).repairClient(code);
    const source = createClientSnapshotRepository(pg.db);
    let loads = 0;
    const fresh = createClientSnapshots({ redis: scope.observer, source: {
      ...source,
      async loadClient(value) {
        loads++;
        return source.loadClient(value);
      },
    } });
    const acquired = await fresh.client.acquire(code);
    expect(loads).toBe(1);
    expect(acquired).toMatchObject({ kind: "present", value: { ssoConfig: managed } });
    const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetCode, code));
    expect(JSON.stringify(audits)).not.toContain("SENTINEL");
  }
  finally { await scope.close(); }
});

test("rotation authentication uses cached current credentials, retains accepted in-flight authentication and failed propagation until repair", async () => {
  const scope = await resource.createScope();
  try {
    const code = scope.clientCode("secret");
    await seed(code);
    const sessions = createUnifiedSessionKernel({
      redis: scope.redis,
      namespace: code,
      userSessionTtlSeconds: 3600,
      clientSessionTtlSeconds: 1800,
      assertOperationActive() {},
    }).forOperation({});
    const root = await sessions.createUserSession({
      subjectIdentifier: randomUUID(),
      subjectContext: "test-context",
      amr: ["pwd"],
    });
    const child = await sessions.openClientSession(root.observation, { clientId: code, protocol: "oidc" });
    if (!("value" in child))
      throw new Error("Expected ClientSession");
    let unavailable = false;
    const candidate = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: scope.redis }),
      db: pg.db,
      logger,

      redis: {
        async eval(script, count, ...args) {
          if (unavailable)
            throw new Error("invalidation unavailable");
          return scope.redis.eval(script, count, ...args);
        },
      },
    });
    const source = createClientSnapshotRepository(pg.db);
    let reads = 0;
    const observer = createClientSnapshots({
      redis: scope.observer,
      source: {
        ...source,
        async loadCredential(value) {
          reads++;
          return source.loadCredential(value);
        },
      },
    });
    const authentication = createClientSecretAuthenticator(observer.credential);
    const accepted = await authentication.authenticate(code, "SSO-SENTINEL");
    const warm = await authentication.authenticate(code, "SSO-SENTINEL");
    expect(warm).toEqual(accepted);
    expect(reads).toBe(1);
    expect(JSON.stringify(accepted)).not.toContain("SENTINEL");
    const wrong = await authentication.authenticate(code, "wrong");
    expect(wrong).toBeNull();
    await candidate.management.service.rotateSecret(code);
    const current = await candidate.management.service.readSecret(code);
    const oldRejected = await authentication.authenticate(code, "SSO-SENTINEL");
    expect(oldRejected).toBeNull();
    const newAccepted = await authentication.authenticate(code, current!.secret);
    expect(newAccepted?.credentialId).toBe(current!.credentialId);
    expect(accepted?.credentialId).not.toBe(current!.credentialId);
    // Authentication already accepted by the caller remains usable without another acquisition.
    expect(accepted).toEqual(warm);
    unavailable = true;
    const error = await failure(() => candidate.management.service.rotateSecret(code));
    expect(error).toMatchObject({ code: ApiErrorCode.AdminMutationCommitted });
    const latest = await candidate.management.service.readSecret(code);
    expect(latest?.secret).not.toBe(current!.secret);
    const cachedOld = await authentication.authenticate(code, current!.secret);
    const cachedNew = await authentication.authenticate(code, latest!.secret);
    expect(cachedOld?.credentialId).toBe(current!.credentialId);
    expect(cachedNew).toBeNull();
    // Audited re-read does not invalidate or repair the still accepted cache.
    await candidate.management.service.readSecret(code);
    const stillCached = await authentication.authenticate(code, current!.secret);
    expect(stillCached).toEqual(cachedOld);
    await createClientSnapshotMaintenance(scope.redis).repairClient(code);
    const repairedOld = await authentication.authenticate(code, current!.secret);
    const repairedNew = await authentication.authenticate(code, latest!.secret);
    expect(repairedOld).toBeNull();
    expect(repairedNew?.credentialId).toBe(latest!.credentialId);
    const audits = await pg.db.select().from(auditLogs);
    expect(JSON.stringify(audits)).not.toContain(latest!.secret);
    expect(JSON.stringify(audits)).not.toContain(current!.secret);
    const rootAfter = await sessions.resolveUserSession(root.bearer);
    const childAfter = await sessions.resolveClientSessionForUse({
      clientId: code,
      userSessionId: root.observation.userSession.userSessionId,
      clientSessionId: child.value.clientSession.clientSessionId,
    });
    expect(rootAfter.status).toBe("resolved");
    expect(childAfter.status).toBe("resolved");
    if (rootAfter.status === "resolved")
      expect(rootAfter.value.userSession).toEqual(root.observation.userSession);
    if (childAfter.status === "resolved")
      expect(childAfter.value.clientSession).toEqual(child.value.clientSession);
  }
  finally {
    await scope.close();
  }
});

test("actual PG projection and candidate Admin mutation invalidate ordinary and credential observations", async () => {
  const scope = await resource.createScope();
  try {
    const code = scope.clientCode("sso");
    await seed(code);
    const candidate = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: scope.redis }),
      db: pg.db,
      redis: scope.redis,
      logger,

    });
    const cold = await candidate.snapshots.client.acquire(code);
    const warm = await candidate.snapshots.client.acquire(code);
    const credential = await candidate.snapshots.credential.acquire(code);
    expect(cold).toEqual({
      kind: "present",
      value: {
        clientCode: code,
        status: ClientStatus.Enable,
        ssoConfig: null,
        ssoEnabled: false,
      },
    });
    expect(warm).toEqual(cold);
    expect(JSON.stringify([cold, warm])).not.toContain("SENTINEL");
    expect(credential).toMatchObject({
      kind: "present",
      value: { secret: "SSO-SENTINEL" },
    });
    const source = createClientSnapshotRepository(pg.db);
    const reads = { client: 0, credential: 0 };
    const probe = createClientSnapshots({
      redis: scope.observer,
      source: {
        async loadClient(value) {
          reads.client++;
          return source.loadClient(value);
        },
        async loadCredential(value) {
          reads.credential++;
          return source.loadCredential(value);
        },
      },
    });
    await probe.client.acquire(code);
    await probe.credential.acquire(code);
    expect(reads).toEqual({ client: 0, credential: 0 });
    const genericCodeKey = `cache:client:code:${code}`;
    const genericSecretKey = `cache:client:secret:INTERNAL-SENTINEL-${code}`;
    await scope.redis.mset(genericCodeKey, "stale", genericSecretKey, "stale");
    const noop = await candidate.management.service.save(code, {
      clientName: "Snapshot candidate",
    });
    expect(noop.changed).toBe(false);
    const genericCached = await scope.redis.mget(genericCodeKey, genericSecretKey);
    expect(genericCached).toEqual([null, null]);
    await probe.client.acquire(code);
    await probe.credential.acquire(code);
    expect(reads).toEqual({ client: 1, credential: 1 });
    await candidate.management.service.selectProtocol(code, {
      ...oidc,
      redirectUris: [...oidc.redirectUris],
      postLogoutRedirectUris: [],
      allowedScopes: [...oidc.allowedScopes],
    });
    await candidate.management.service.setEnabled(code, true);
    const enabled = await candidate.snapshots.client.acquire(code);
    expect(enabled).toMatchObject({
      kind: "present",
      value: { ssoEnabled: true, ssoConfig: oidc },
    });
    await candidate.management.service.save(code, {
      status: ClientStatus.Maintenance,
    });
    const maintenance = await candidate.snapshots.gate.acquire(code);
    expect(maintenance).toEqual({
      kind: "present",
      value: { clientCode: code, status: ClientStatus.Maintenance },
    });
    expect(cold).toMatchObject({
      kind: "present",
      value: { status: ClientStatus.Enable },
    });
    const detail = await candidate.management.service.detail(code);
    expect(JSON.stringify(detail)).not.toContain("SENTINEL");
  }
  finally {
    await scope.close();
  }
});

test("actual committed mutation with failed Redis propagation retains old value until explicit repair, no replay", async () => {
  const scope = await resource.createScope();
  try {
    const code = scope.clientCode("failure");
    await seed(code);
    let failInvalidation = false;
    const candidate = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: scope.redis }),
      db: pg.db,
      logger,

      redis: {
        async eval(script, count, ...args) {
          if (failInvalidation)
            throw new Error("Redis unavailable");
          return scope.redis.eval(script, count, ...args);
        },
      },
    });
    const observer = createClientSnapshots({
      redis: scope.observer,
      source: createClientSnapshotRepository(pg.db),
    });
    await observer.client.acquire(code);
    await observer.credential.acquire(code);
    failInvalidation = true;
    const before = await pg.db.select().from(auditLogs);
    const error = await failure(() =>
      candidate.management.service.save(code, {
        status: ClientStatus.Maintenance,
      }),
    );
    expect(error).toMatchObject({ code: ApiErrorCode.AdminMutationCommitted });
    const committed = await pg.db
      .select({ status: clients.status })
      .from(clients)
      .where(eq(clients.clientCode, code));
    expect(committed[0]!.status).toBe(ClientStatus.Maintenance);
    const stillOld = await observer.client.acquire(code);
    expect(stillOld).toMatchObject({
      kind: "present",
      value: { status: ClientStatus.Enable },
    });
    const after = await pg.db.select().from(auditLogs);
    expect(after.length).toBe(before.length + 1);
    await createClientSnapshotMaintenance(scope.redis).repairClient(code);
    const repaired = await observer.client.acquire(code);
    expect(repaired).toMatchObject({
      kind: "present",
      value: { status: ClientStatus.Maintenance },
    });
  }
  finally {
    await scope.close();
  }
});

for (const operation of ["save", "rotateSecret"] as const) {
  test(`Unknown COMMIT ${operation} keeps original error, actual mutation is not replayed and both caches invalidate`, async () => {
    const scope = await resource.createScope();
    try {
      const code = scope.clientCode("unknown");
      await seed(code);
      const snapshots = createClientSnapshots({
        redis: scope.redis,
        source: createClientSnapshotRepository(pg.db),
      });
      await snapshots.client.acquire(code);
      await snapshots.credential.acquire(code);
      const original = new Error("commit acknowledgement lost");
      let transactions = 0;
      let invalidations = 0;
      const service = createClientSsoService({
        client: createClientSsoRepository(pg.db),
        logger,

        credentials: {
          create: () => ({
            secret: "unknown-commit-current",
            id: randomUUID(),
            updatedAt: new Date().toISOString(),
          }),
        },
        invalidation: {
          async invalidateClient(value) {
            invalidations++;
            await snapshots.invalidateClient(value);
          },
        },
        uow: createUnitOfWork({
          db: {
            async transaction<T>(work: (tx: DbClient) => Promise<T>): Promise<T> {
              transactions++;
              await pg.db.transaction(work);
              throw original;
            },
          },
          logger,
          createTxPorts: tx => ({
            client: createClientSsoRepository(tx),
            audit: createAdminAuditService({
              auditRepository: createAuditRepository(tx),
            }),
          }),
        }),
      });
      const error = await failure(() =>
        operation === "save"
          ? service.save(code, { status: ClientStatus.Disable })
          : service.rotateSecret(code),
      );
      expect(error).toBe(original);
      expect(transactions).toBe(1);
      expect(invalidations).toBe(1);
      const observed = await snapshots.client.acquire(code);
      expect(observed).toMatchObject({
        kind: "present",
        value: { status: operation === "save" ? ClientStatus.Disable : ClientStatus.Enable },
      });
      const credential = await snapshots.credential.acquire(code);
      expect(credential).toMatchObject({
        kind: "present",
        value: {
          secret: operation === "save" ? "SSO-SENTINEL" : "unknown-commit-current",
        },
      });
      const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetCode, code));
      expect(audits).toHaveLength(1);
    }
    finally {
      await scope.close();
    }
  });
}

for (const kind of ["client", "credential"] as const) {
  test(`actual PG ${kind} late read cannot republish after successful Admin invalidation`, async () => {
    const scope = await resource.createScope();
    const reached = latch();
    const resume = latch();
    try {
      const code = scope.clientCode("late");
      await seed(code);
      const source = createClientSnapshotRepository(pg.db);
      const method = kind === "client" ? "loadClient" : "loadCredential";
      let once = true;
      let loads = 0;
      const snapshots = createClientSnapshots({
        redis: scope.redis,
        source: {
          ...source,
          [method]: async (value: string) => {
            loads++;
            const row = await source[method](value);
            if (once) {
              once = false;
              reached.release();
              await resume.promise;
            }
            return row;
          },
        },
      });
      const pending = snapshots[kind].acquire(code);
      await reached.promise;
      const admin = createClientSsoSnapshotManagement({
        clientCache: createAdminClientCache({ redis: scope.redis }),
        db: pg.db,
        redis: scope.observer,
        logger,

      });
      if (kind === "credential")
        await admin.management.service.rotateSecret(code);
      else await admin.management.service.save(code, { status: ClientStatus.Maintenance });
      resume.release();
      const observed = await pending;
      expect(observed.kind).toBe("present");
      expect(loads).toBe(2);
      const current = await snapshots.client.acquire(code);
      expect(current).toMatchObject({
        kind: "present",
        value: { status: kind === "credential" ? ClientStatus.Enable : ClientStatus.Maintenance },
      });
      if (kind === "credential") {
        const credential = await snapshots.credential.acquire(code);
        expect(credential.kind).toBe("present");
        if (credential.kind === "present")
          expect(credential.value.secret).not.toBe("SSO-SENTINEL");
      }
      expect(once).toBe(false);
    }
    finally {
      resume.release();
      await scope.close();
    }
  });
}
