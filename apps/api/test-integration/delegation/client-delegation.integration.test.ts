import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createInternalDelegationQueryResource } from "@api/composition/internal-delegation-query";
import { createClientDelegationResolutionRepository } from "@api/composition/repositories/client-delegation-resolution.repository";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import { createAuditRepository } from "@api/services/audit/audit.repository";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createResolveClientDelegationsUseCase } from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.use-case";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  ClientDelegationStatus as Status,
  UserStatus,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import {
  auditLogs,
  clientDelegations,
  clients,
  organizationClosures,
  organizations,
  userProfileDirty,
  users,
} from "@iam/db/schema";
import { createDelegationService } from "@iam/delegation";
import { type GenericClientRuntimeDto, toGenericClientRuntimeDto } from "@iam/domain/client";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import type { ApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";

const startTime = new Date("2026-08-24T08:00:00Z");
const observedAt = new Date("2026-08-25T08:00:00Z");
const endTime = new Date("2026-08-26T08:00:00Z");
const context = { actionPrefix: "internal" as const, actor: { actorType: "client" as const, actorClientCode: "one" } };
let harness: ApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});
afterAll(async () => {
  await harness?.close();
});
beforeEach(async () => {
  await harness.reset();
  await harness.db
    .insert(users)
    .values(["alice", "bob", "carol", "dave"].map((username) => ({ username, name: username })));
  await harness.db.insert(clients).values(
    ["one", "two"].map((clientCode) => ({
      clientCode,
      clientName: clientCode,
      clientSecret: clientCode,
      extAttributes: {},
    })),
  );
  await harness.db.insert(organizations).values([
    { orgCode: "ROOT", orgName: "ROOT", path: "ROOT", level: OrganizationLevel.One, orgType: OrganizationType.Company },
    {
      orgCode: "LEFT",
      orgName: "LEFT",
      path: "ROOT/LEFT",
      parentId: 1,
      level: OrganizationLevel.Two,
      orgType: OrganizationType.Department,
    },
    {
      orgCode: "RIGHT",
      orgName: "RIGHT",
      path: "ROOT/RIGHT",
      parentId: 1,
      level: OrganizationLevel.Two,
      orgType: OrganizationType.Department,
    },
  ]);
  await harness.db.insert(organizationClosures).values([
    { ancestorId: 1, descendantId: 1, depth: 0 },
    { ancestorId: 2, descendantId: 2, depth: 0 },
    { ancestorId: 3, descendantId: 3, depth: 0 },
    { ancestorId: 1, descendantId: 2, depth: 1 },
    { ancestorId: 1, descendantId: 3, depth: 1 },
  ]);
});
function service(db: DbClient = harness.db) {
  return createDelegationService({
    db,
    recordAudit: async (tx, event) =>
      createApiAuditLogWriter({ auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
  });
}
function input(overrides: Record<string, unknown> = {}) {
  return { delegatorUsername: "alice", delegateeUsername: "bob", orgCode: "LEFT", startTime, endTime, ...overrides };
}
function app(db: DbClient = harness.db) {
  const handlers = createDelegationHandlers({
    delegationService: service(db),
    resolveClientDelegations: createResolveClientDelegationsUseCase({
      clock: { nowDate: () => observedAt },
      resolution: createClientDelegationResolutionRepository(db),
    }),
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: { "./src/routes/internal/delegation/delegation.index.ts": { default: createDelegationRoute(handlers) } },
    middlewares: {
      "./src/routes/internal/_middleware.ts": {
        default: createInternalMiddlewares({
          internalAuthenticationHandler: createInternalAuthenticationHandler<GenericClientRuntimeDto>({
            getClientBySecret: async (secret) =>
              (await harness.db.select().from(clients).where(eq(clients.clientSecret, secret))).map(
                toGenericClientRuntimeDto,
              )[0] ?? null,
          }),
        }),
      },
    },
  });
}
async function request(path: string, body: unknown, options: { client?: string; method?: string; db?: DbClient } = {}) {
  const response = await app(options.db).request(`http://localhost/internal/delegations${path}`, {
    method: options.method ?? "POST",
    headers: { apikey: options.client ?? "one", Client: "forged", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function capture(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}
async function resolve(usernames = ["alice"], orgCode = "LEFT", client = "one") {
  return request("/resolve", { usernames, orgCode }, { client });
}
async function seed(overrides: Partial<typeof clientDelegations.$inferInsert> = {}) {
  return (
    await harness.db
      .insert(clientDelegations)
      .values({
        delegatorUserId: 1,
        delegateeUserId: 2,
        clientId: 1,
        organizationScopeId: 2,
        startTime,
        endTime,
        ...overrides,
      })
      .returning()
  )[0]!;
}

test("Internal creates Client-bound details, isolates searches and IDs, and audits the authenticated actor", async () => {
  const first = await request("/", input());
  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({
    clientId: 1,
    client: { clientCode: "one" },
    delegatorUsername: "alice",
    delegateeUsername: "bob",
  });
  const second = await request("/", input({ delegateeUsername: "carol" }), { client: "two" });
  expect(second.status).toBe(200);
  const search = await request("/search", {});
  expect(search.body.data.map((row: { id: number }) => row.id)).toEqual([first.body.data.id]);
  const cross = await request(`/${second.body.data.id}`, { status: Status.Disable }, { method: "PATCH" });
  expect(cross.status).toBe(404);
  expect((await resolve()).body.data).toEqual([{ username: "alice", delegateeUsername: "bob" }]);
  expect((await resolve(["alice"], "LEFT", "two")).body.data).toEqual([
    { username: "alice", delegateeUsername: "carol" },
  ]);
  const audit = await harness.db.select().from(auditLogs);
  expect(audit.map((row) => row.actorClientCode)).toEqual(["one", "two"]);
  const dirty = await harness.db.select().from(userProfileDirty);
  expect(dirty).toEqual([]);
  expect(JSON.stringify(first.body.data)).not.toContain("clientSecret");
});

test("every Internal input rejects obsolete privilege fields and caller-selected Clients", async () => {
  for (const [path, payload] of [
    ["/", { ...input(), privilegeCodes: ["read"] }],
    ["/", { ...input(), clientId: 2 }],
    ["/search", { privCodes: ["read"] }],
    ["/search", { clientIds: [2] }],
    ["/resolve", { usernames: ["alice"], orgCode: "LEFT", privilegeCode: "read" }],
  ]) {
    const result = await request(path as string, payload);
    expect(result.status).toBe(422);
  }
});

test("open overlapping subtrees and closed periods conflict, including Pause and identical receivers", async () => {
  const original = await service().create(input(), { kind: "client", clientId: 1 }, context);
  await service().update(original.result.id, { status: Status.Pause }, { kind: "all" }, context);
  for (const candidate of [
    input({ orgCode: "ROOT" }),
    input({ startTime: endTime, endTime: new Date("2026-08-27T08:00:00Z") }),
  ]) {
    const failure = await request("/", candidate);
    expect(failure.status).toBe(409);
    expect(failure.body.code).toBe("CLIENT_DELEGATION.CONFLICT");
  }
  expect((await request("/", input({ orgCode: "RIGHT" }))).status).toBe(200);
  expect((await request("/", input(), { client: "two" })).status).toBe(200);
});

test("creation requires enabled references and rejects self-delegation and invalid periods", async () => {
  for (const overrides of [{ delegateeUsername: "alice" }, { endTime: startTime }]) {
    expect((await request("/", input(overrides))).status).toBe(400);
  }
  await harness.db.update(users).set({ status: UserStatus.Pause }).where(eq(users.username, "bob"));
  expect((await request("/", input())).status).toBe(400);
  const selected = await service().selectUsers({ purpose: "create" });
  expect(selected.map((row) => row.username)).toEqual(["alice", "carol", "dave"]);
});

test("expiry can be extended, Pause stays paused, terminal updates cannot reopen or rewrite business fields", async () => {
  const created = await request("/", input({ endTime: new Date("2026-08-25T07:00:00Z") }));
  const id = created.body.data.id;
  expect((await resolve()).body.data[0].delegateeUsername).toBeNull();
  expect((await request(`/${id}`, { endTime }, { method: "PATCH" })).body.data).toBe(true);
  expect((await resolve()).body.data[0].delegateeUsername).toBe("bob");
  await request(`/${id}`, { status: Status.Pause }, { method: "PATCH" });
  await request(`/${id}`, { endTime: new Date("2026-08-27T08:00:00Z") }, { method: "PATCH" });
  expect((await resolve()).body.data[0].delegateeUsername).toBeNull();
  await request(`/${id}`, { status: Status.Disable }, { method: "PATCH" });
  const before = (await service().search({}, { kind: "all" }))[0]!;
  expect((await request(`/${id}`, { status: Status.Disable }, { method: "PATCH" })).body.data).toBe(true);
  expect((await service().search({}, { kind: "all" }))[0]!.updateTime).toEqual(before.updateTime);
  const reopen = await request(`/${id}`, { status: Status.Enable }, { method: "PATCH" });
  expect(reopen.status).toBe(409);
  expect(reopen.body.code).toBe("CLIENT_DELEGATION.ENDED");
  expect(
    (await request(`/${id}`, { status: Status.Disable, description: "rewrite" }, { method: "PATCH" })).status,
  ).toBe(409);
  expect((await request(`/${id}`, { clientId: 2 }, { method: "PATCH" })).status).toBe(422);
});

test("shared scopes enforce self ownership, read-only recipients, and preserve ended history with deleted references", async () => {
  const s = service();
  const created = await s.create(
    { ...input(), delegatorUsername: undefined, clientId: 1 },
    { kind: "delegator", userId: 1 },
    { ...context, actionPrefix: "sso", actor: { actorType: "user", actorUserId: 1 } },
  );
  expect((await s.search({}, { kind: "delegatee", userId: 2 })).map((row) => row.id)).toEqual([created.result.id]);
  expect(
    await capture(s.update(created.result.id, { status: Status.Disable }, { kind: "delegator", userId: 2 }, context)),
  ).toBeInstanceOf(Error);
  await s.update(created.result.id, { status: Status.Disable }, { kind: "delegator", userId: 1 }, context);
  await harness.db.update(users).set({ isDelete: true, name: "Bob renamed" }).where(eq(users.id, 2));
  await harness.db.update(clients).set({ isDelete: true }).where(eq(clients.id, 1));
  await harness.db.update(organizations).set({ isDelete: true }).where(eq(organizations.id, 2));
  const history = await s.search({ statuses: [Status.Disable] }, { kind: "delegator", userId: 1 });
  expect(history[0]).toMatchObject({
    delegateeUser: { name: "Bob renamed", isDelete: true },
    client: { isDelete: true },
    organizationScope: { isDelete: true },
  });
});

test("a failed audit rolls back creation and creates no visible relationship", async () => {
  const failing = createDelegationService({
    db: harness.db,
    recordAudit: async () => {
      throw new Error("audit unavailable");
    },
  });
  const failure = await capture(failing.create(input(), { kind: "client", clientId: 1 }, context));
  expect(failure).toBeInstanceOf(Error);
  expect(await service().search({}, { kind: "all" })).toEqual([]);
});

test("a discarded locked update fails without changing the relationship or recording success", async () => {
  const original = await seed();
  await harness.sql.unsafe(`
    CREATE FUNCTION discard_delegation_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RETURN NULL; END $$;
    CREATE TRIGGER discard_delegation_update BEFORE UPDATE ON client_delegation
    FOR EACH ROW EXECUTE FUNCTION discard_delegation_update();
  `);
  try {
    const rejected = await request(`/${original.id}`, { status: Status.Pause }, { method: "PATCH" });
    expect(rejected.status).toBe(500);
    const visible = await service().search({}, { kind: "all" });
    expect(visible).toMatchObject([{ id: original.id, status: Status.Enable }]);
    const audits = await harness.db.select().from(auditLogs);
    expect(audits).toEqual([]);
  } finally {
    await harness.sql.unsafe("DROP TRIGGER discard_delegation_update ON client_delegation");
    await harness.sql.unsafe("DROP FUNCTION discard_delegation_update()");
  }
});

test.each(["missing", "deleted"])(
  "update refuses a %s delegator before touching the relationship or audit",
  async (variant) => {
    const original = await seed({ delegatorUserId: variant === "missing" ? 9999 : 1 });
    if (variant === "deleted") await harness.db.update(users).set({ isDelete: true }).where(eq(users.id, 1));
    const rejected = await capture(
      service().update(original.id, { description: "must not commit" }, { kind: "all" }, context),
    );
    expect(rejected).toMatchObject({ code: "USER.NOT_FOUND", httpStatus: 404 });
    const rows = await harness.db.select().from(clientDelegations);
    const audits = await harness.db.select().from(auditLogs);
    expect(rows).toEqual([original]);
    expect(audits).toEqual([]);
  },
);

test("ordinary identical fields are silent no-ops while explicit status keeps its intent audit", async () => {
  const original = await seed();
  const s = service();
  const adminContext = { actionPrefix: "admin" as const, actor: { actorType: "admin" as const, actorUserId: 1 } };
  const ordinary = await s.update(original.id, { description: null }, { kind: "all" }, adminContext);
  expect(ordinary.changed).toBe(false);
  const noOpAudits = await harness.db.select().from(auditLogs);
  expect(noOpAudits).toEqual([]);
  const status = await s.update(original.id, { status: Status.Enable }, { kind: "all" }, adminContext);
  expect(status.changed).toBe(false);
  const statusAudits = await harness.db.select().from(auditLogs);
  const rows = await harness.db.select().from(clientDelegations);
  expect(statusAudits).toMatchObject([{ action: "admin.delegation.update", details: { changed: false } }]);
  expect(rows).toEqual([original]);
});

test("parallel writers using different entry scopes serialize on the delegator and retain one relationship", async () => {
  const competing = concurrentDatabase(3);
  const writes = await Promise.allSettled([
    service(competing.db).create(input({ clientId: 1 }), { kind: "all" }, { ...context, actionPrefix: "admin" }),
    service(competing.db).create(input(), { kind: "client", clientId: 1 }, context),
    service(competing.db).create(
      { ...input(), delegatorUsername: undefined, clientId: 1 },
      { kind: "delegator", userId: 1 },
      context,
    ),
  ]);
  expect(new Set(competing.identities.map((row) => row.pid)).size).toBe(3);
  expect(new Set(competing.identities.map((row) => row.transactionId)).size).toBe(3);
  expect(writes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  expect(writes.filter((row) => row.status === "rejected")).toHaveLength(2);
  expect(await service().search({}, { kind: "all" })).toHaveLength(1);
});

test("parallel restore and period changes share the same conflict decision", async () => {
  const first = await seed({
    status: Status.Pause,
    startTime: new Date("2026-01-01"),
    endTime: new Date("2026-01-02"),
  });
  const second = await seed({
    status: Status.Pause,
    startTime: new Date("2026-02-01"),
    endTime: new Date("2026-02-02"),
  });
  const changes = await Promise.allSettled([
    service().update(first.id, { startTime, endTime, status: Status.Enable }, { kind: "all" }, context),
    service().update(
      second.id,
      { startTime, endTime, status: Status.Enable },
      { kind: "delegator", userId: 1 },
      context,
    ),
  ]);
  expect(changes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  expect(changes.filter((row) => row.status === "rejected")).toHaveLength(1);
  const rows = await service().search({ statuses: [Status.Enable], validTime: observedAt }, { kind: "all" });
  expect(rows).toHaveLength(1);
});

test("management queries combine Client, both users, organization coverage, status and period filters", async () => {
  const selected = await seed({ organizationScopeId: 1, status: Status.Pause });
  await seed({ organizationScopeId: 3, clientId: 2, delegateeUserId: 3, status: Status.Disable });
  const result = await service().search(
    {
      clientIds: [1],
      delegatorUsernames: ["alice"],
      delegateeUsernames: ["bob"],
      orgCodes: ["LEFT"],
      statuses: [Status.Pause],
      startTime: observedAt,
      endTime,
      validTime: observedAt,
    },
    { kind: "all" },
  );
  expect(result.map((row) => row.id)).toEqual([selected.id]);
  expect(await service().search({ clientIds: [] }, { kind: "all" })).toEqual([]);
  expect(await service().search({ statuses: [Status.Enable] }, { kind: "all" })).toEqual([]);
  expect(await service().search({ startTime: new Date("2026-08-27") }, { kind: "all" })).toEqual([]);
});

test("a selected descendant does not cover its ancestor or siblings, and a disabled Client cannot authenticate", async () => {
  await seed();
  expect((await resolve(["alice"], "ROOT")).body.data[0].delegateeUsername).toBeNull();
  expect((await resolve(["alice"], "RIGHT")).body.data[0].delegateeUsername).toBeNull();
  await harness.db.update(clients).set({ status: 3 }).where(eq(clients.id, 1));
  expect((await resolve()).status).toBe(401);
});

test("resolution follows current descendants, closed endpoints and direct cycles at one instant", async () => {
  await seed({ organizationScopeId: 1, startTime: observedAt });
  await seed({ delegatorUserId: 2, delegateeUserId: 1, organizationScopeId: 1, endTime: observedAt });
  await harness.db.insert(organizations).values({
    orgCode: "NEW",
    orgName: "New",
    path: "ROOT/NEW",
    parentId: 1,
    level: OrganizationLevel.Two,
    orgType: OrganizationType.Department,
  });
  await harness.db.insert(organizationClosures).values([
    { ancestorId: 4, descendantId: 4, depth: 0 },
    { ancestorId: 1, descendantId: 4, depth: 1 },
  ]);
  const result = await resolve(["dave", "bob", "alice"], "NEW");
  expect(result.body.data).toEqual([
    { username: "dave", delegateeUsername: null },
    { username: "bob", delegateeUsername: "alice" },
    { username: "alice", delegateeUsername: "bob" },
  ]);
});

test("resolution recognizes exact inactive identifiers without granting access", async () => {
  await seed();
  await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, 2));
  await harness.db.update(users).set({ status: UserStatus.Pause }).where(eq(users.id, 1));
  await harness.db.update(organizations).set({ status: OrganizationStatus.Disable }).where(eq(organizations.id, 2));
  expect((await resolve()).body.data[0].delegateeUsername).toBe("bob");
  const missing = await resolve([" alice", "missing"], "left");
  expect(missing.status).toBe(404);
  expect(missing.body.data).toEqual({ usernames: [" alice", "missing"], orgCodes: ["left"] });
});

test.each([
  "duplicate-same",
  "duplicate-different",
  "self",
  "missing-user",
  "deleted-user",
  "missing-org",
  "deleted-org",
])("integrity failure %s rejects the whole batch", async (variant) => {
  const first = await seed();
  if (variant.startsWith("duplicate")) await seed({ delegateeUserId: variant === "duplicate-same" ? 2 : 3 });
  if (variant === "self")
    await harness.db.update(clientDelegations).set({ delegateeUserId: 1 }).where(eq(clientDelegations.id, first.id));
  if (variant === "missing-user")
    await harness.db.update(clientDelegations).set({ delegateeUserId: 9999 }).where(eq(clientDelegations.id, first.id));
  if (variant === "deleted-user") await harness.db.update(users).set({ isDelete: true }).where(eq(users.id, 2));
  if (variant === "missing-org" || variant === "deleted-org") {
    await harness.db
      .update(clientDelegations)
      .set({ organizationScopeId: 9 })
      .where(eq(clientDelegations.id, first.id));
    await harness.db.insert(organizationClosures).values({ ancestorId: 9, descendantId: 2, depth: 1 });
    if (variant === "deleted-org")
      await harness.db.insert(organizations).values({
        id: 9,
        orgCode: "DELETED",
        orgName: "Deleted",
        path: "Deleted",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
        isDelete: true,
      });
  }
  const result = await resolve(["alice", "dave"]);
  expect(result.status).toBe(503);
  expect(result.body.data).toBeNull();
});

test("statement timeout stays bounded and returns an unavailable response", async () => {
  const resource = createInternalDelegationQueryResource({ databaseUrl: harness.databaseUrl });
  try {
    const timeoutDb: DbClient = Object.create(resource.db);
    timeoutDb.execute = () => resource.db.execute(sql`select pg_sleep(3)`) as never;
    const result = await request("/resolve", { usernames: ["alice"], orgCode: "LEFT" }, { db: timeoutDb });
    expect(result.status).toBe(503);
  } finally {
    await resource.close();
  }
});

function concurrentDatabase(parties: number) {
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    release = resolve;
  });
  const identities: { pid: number; transactionId: string }[] = [];
  let lockObserved: Promise<void>;
  const db: DbClient = Object.create(harness.db);
  db.transaction = async (callback, options) =>
    harness.db.transaction(async (tx) => {
      const rows = await tx.execute<{ pid: number; transactionId: string }>(
        sql`select pg_backend_pid() as pid, txid_current()::text as "transactionId"`,
      );
      identities.push(rows[0]!);
      if (identities.length === parties) {
        lockObserved = observeLockWait();
        release();
      }
      await entered;
      try {
        return await callback(tx);
      } finally {
        await lockObserved;
      }
    }, options);
  async function observeLockWait() {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
        select 1 from pg_stat_activity where pid = any(${identities.map((row) => row.pid)})
          and pg_blocking_pids(pid) && ${identities.map((row) => row.pid)}::integer[]
      ) as blocked`;
      if (rows[0]!.blocked) return;
    }
    throw new Error("Expected independent delegation writers to wait for the shared PostgreSQL row lock");
  }
  return { db, identities };
}
