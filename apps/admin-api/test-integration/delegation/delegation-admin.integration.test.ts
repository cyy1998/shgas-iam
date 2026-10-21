import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createAdminApiRouteComposition } from "@admin-api/composition/routes";
import { createDelegationAdapter } from "@admin-api/routes/admin/delegation/delegation.adapter";
import { createDelegationRoute } from "@admin-api/routes/admin/delegation/delegation.index";
import { AdminDelegationVoSchema } from "@admin-api/routes/admin/delegation/delegation.schema";
import { createAdminRestAuthorizationHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { addTestAdminAuthorizationMiddleware } from "@admin-api/testing/admin-authorization";
import { createRouter } from "@iam/api-core/core/create-router";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { ClientStatus, OrganizationLevel, OrganizationStatus, OrganizationType, UserStatus } from "@iam/contracts";
import { clients, organizationClosures, organizations, users } from "@iam/db/schema";
import { createDelegationService } from "@iam/delegation";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate client restart identity cascade`;
});
afterAll(async () => {
  await harness?.close();
});

function app(roles = ["iam:admin"]) {
  const service = createDelegationService({
    db: harness.db,
    recordAudit: async (tx, event) =>
      createAdminAuditService({ auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
  });
  const adapter = createDelegationAdapter({ delegationService: service });
  const router = createRouter();
  addTestAdminAuthorizationMiddleware(router as never, roles);
  router.onError(createErrorHandler({ bindings: () => ({}), error() {}, warn() {}, info() {} } as never));
  const rest = createDelegationRoute(adapter);
  const { restOperationSurface: surface } = createAdminApiRouteComposition({
    auditService: {},
    runtime: { random: {} },
    services: {
      delegation: service,
      client: {},
      clientSso: { service: {} },
      employment: {},
      organization: {},
      organizationResponsibility: {},
      position: {},
      role: {},
      sessionManagement: {},
      user: {},
    },
    useCases: {
      employment: {
        changeEmploymentAvailability: {},
        createEmployment: {},
        endEmployment: {},
        managePrimaryEmployment: {},
        resignUser: {},
        transferEmployment: {},
      },
      organizationResponsibility: { createAssignment: {}, manageAssignmentLifecycle: {} },
    },
  } as never);
  router.use("/admin/*", async (c, next) => {
    c.set("tierBasePath" as never, "/admin" as never);
    await next();
  });
  router.use("/admin/*", createAdminRestAuthorizationHandler(surface));
  router.route("/admin", rest);
  router.all("/rpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: adapter.delegationAdminRouter,
      createContext: () => ({ hono: c }),
    }),
  );
  return router;
}

async function seed() {
  await harness.db.insert(users).values([
    { username: "alice", name: "Alice", password: "synthetic" },
    { username: "bob", name: "Bob", password: "synthetic" },
  ]);
  const [client] = await harness.db
    .insert(clients)
    .values({ clientCode: "expense", clientName: "报销", clientSecret: "secret-not-public", extAttributes: {} })
    .returning();
  const [organization] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "ROOT",
      orgName: "总部",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
      path: "ROOT",
    })
    .returning();
  if (!client || !organization) throw new Error("Delegation fixture seed returned no identity");
  await harness.db
    .insert(organizationClosures)
    .values({ ancestorId: organization.id, descendantId: organization.id, depth: 0 });
  return {
    delegatorUsername: "alice",
    delegateeUsername: "bob",
    clientId: client.id,
    orgCode: "ROOT",
    startTime: "2026-10-01T00:00:00Z",
    endTime: "2026-11-01T00:00:00Z",
    description: "代办",
  };
}

function post(router: ReturnType<typeof app>, path: string, body: unknown) {
  return router.request(`http://localhost/admin/delegations${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Admin Client delegation public requests", () => {
  test("HR cannot read, create, mutate or enumerate selectors, even with malformed input", async () => {
    const router = app(["iam:hr-admin"]);
    for (const path of ["/", "/search", "/selectors/users", "/selectors/clients", "/selectors/organizations"]) {
      const response = await post(router, path, { privilegeCodes: ["legacy"] });
      expect(response.status).toBe(403);
    }
    const response = await router.request("http://localhost/admin/delegations/999", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    const trpc = await router.request("http://localhost/rpc/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(trpc.status).toBe(403);
  });

  test("full administrator creates and finds a safe global delegation", async () => {
    const input = await seed();
    const router = app();
    const created = await post(router, "/", input);
    expect(created.status).toBe(200);
    const createdBody = z
      .object({ data: z.object({ changed: z.boolean(), result: AdminDelegationVoSchema }) })
      .parse(await created.json());
    expect(createdBody.data).toMatchObject({
      changed: true,
      result: {
        delegatorUsername: "alice",
        client: { clientCode: "expense" },
        allowedActions: { edit: { allowed: true } },
      },
    });
    const response = await post(router, "/search", { clientIds: [input.clientId] });
    expect(response.status).toBe(200);
    const body = z.object({ data: z.array(AdminDelegationVoSchema) }).parse(await response.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.delegateeUsername).toBe("bob");
    expect(JSON.stringify(body)).not.toMatch(/secret-not-public|synthetic|password|clientSecret/);
    const audit = await createAdminAuditService({
      auditRepository: createAuditRepository(harness.db),
    }).searchAuditLogsForAdmin({ pageNum: 1, pageSize: 20, conditions: { actions: ["admin.delegation.create"] } });
    expect(audit.result).toMatchObject([
      { actorType: "admin", actorUsername: "admin", sourceApp: "iam-admin", targetId: createdBody.data.result.id },
    ]);
  });

  test("REST and tRPC share lifecycle decisions, terminal rejection and strict immutable bindings", async () => {
    const input = await seed();
    const router = app();
    const created = await post(router, "/", input);
    const {
      data: { result },
    } = z.object({ data: z.object({ result: AdminDelegationVoSchema }) }).parse(await created.json());
    const update = (data: unknown) =>
      router.request("http://localhost/rpc/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: result.id, data }),
      });
    const edited = await router.request(`http://localhost/admin/delegations/${result.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "调整说明" }),
    });
    expect(edited.status).toBe(200);
    const editedBody = await edited.json();
    expect(editedBody).toMatchObject({ data: { changed: true, result: null } });
    const forged = await update({ clientId: 900 });
    expect(forged.status).toBe(400);
    const paused = await update({ status: 2 });
    expect(paused.status).toBe(200);
    const pausedBody = await paused.json();
    expect(pausedBody).toMatchObject({
      result: {
        data: {
          changed: true,
          result: null,
        },
      },
    });
    const pausedRows = await post(router, "/search", { statuses: [2] });
    expect(await pausedRows.json()).toMatchObject({
      data: [{ status: 2, allowedActions: { pause: { allowed: false }, resume: { allowed: true } } }],
    });
    const resumed = await update({ status: 1 });
    expect(await resumed.json()).toMatchObject({ result: { data: { changed: true, result: null } } });
    const ended = await update({ status: 3 });
    expect(ended.status).toBe(200);
    expect(await ended.json()).toMatchObject({ result: { data: { changed: true, result: null } } });
    const retry = await update({ status: 3 });
    expect(await retry.json()).toMatchObject({ result: { data: { changed: false, result: null } } });
    const reopen = await update({ status: 1 });
    expect(reopen.status).toBe(409);
    const historical = await post(router, "/search", { statuses: [3] });
    expect(await historical.json()).toMatchObject({
      data: [{ allowedActions: { edit: { allowed: false }, end: { allowed: false } } }],
    });
  });

  test("selectors omit unavailable objects and conflict rejection preserves the original record", async () => {
    const input = await seed();
    const router = app();
    await harness.db.insert(clients).values({
      clientCode: "paused",
      clientName: "暂停应用",
      clientSecret: "private",
      status: ClientStatus.Maintenance,
      extAttributes: {},
    });
    await post(router, "/", input);
    const duplicate = await post(router, "/", input);
    expect(duplicate.status).toBe(409);
    const duplicateBody = await duplicate.json();
    expect(duplicateBody).toMatchObject({ code: "CLIENT_DELEGATION.CONFLICT" });
    const oldParameters = await post(router, "/", { ...input, privilegeCodes: ["legacy"] });
    expect(oldParameters.status).toBe(422);
    const selected = await post(router, "/selectors/clients", { purpose: "create" });
    const selection = await selected.json();
    expect(selection).toMatchObject({ data: [{ id: input.clientId, clientCode: "expense", clientName: "报销" }] });
    expect(JSON.stringify(selection)).not.toMatch(/paused|private|secret|isDelete|status/);
    const all = await post(router, "/search", {});
    const body = z.object({ data: z.array(AdminDelegationVoSchema) }).parse(await all.json());
    expect(body.data).toHaveLength(1);
  });

  test.each(["inactive", "deleted"])(
    "historical filters include %s references while creation stays restricted",
    async (variant) => {
      const input = await seed();
      const router = app();
      const created = await post(router, "/", input);
      const {
        data: { result },
      } = z.object({ data: z.object({ result: AdminDelegationVoSchema }) }).parse(await created.json());
      await router.request(`http://localhost/admin/delegations/${result.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: 3 }),
      });
      const unavailable = variant === "deleted";
      await harness.db.update(users).set({ status: UserStatus.Disable, isDelete: unavailable });
      await harness.db.update(clients).set({ status: ClientStatus.Disable, isDelete: unavailable });
      await harness.db.update(organizations).set({ status: OrganizationStatus.Disable, isDelete: unavailable });
      for (const [kind, expected] of [
        [
          "users",
          [
            { id: result.delegatorUserId, username: "alice", name: "Alice" },
            { id: result.delegateeUserId, username: "bob", name: "Bob" },
          ],
        ],
        ["clients", [{ id: input.clientId, clientCode: "expense", clientName: "报销" }]],
        ["organizations", [{ id: result.organizationScopeId, orgCode: "ROOT", orgName: "总部" }]],
      ] as const) {
        const filters = await post(router, `/selectors/${kind}`, { purpose: "filter" });
        expect(filters.status).toBe(200);
        const filterBody = await filters.json();
        expect(filterBody).toMatchObject({ data: expected });
        const creation = await post(router, `/selectors/${kind}`, { purpose: "create" });
        expect(await creation.json()).toMatchObject({ data: [] });
      }
      const history = await post(router, "/search", {
        delegatorUsernames: ["alice"],
        delegateeUsernames: ["bob"],
        clientIds: [input.clientId],
        orgCodes: ["ROOT"],
        statuses: [3],
      });
      expect(await history.json()).toMatchObject({ data: [{ id: result.id }] });
      const rejected = await post(router, "/", input);
      expect(rejected.status).toBe(400);
      // Restoring the owner cannot bypass the receiver/Client/Organization creation preconditions.
      await harness.db
        .update(users)
        .set({ status: UserStatus.Enable, isDelete: false })
        .where(eq(users.username, "alice"));
      expect((await post(router, "/", input)).status).toBe(400);
      await harness.db
        .update(users)
        .set({ status: UserStatus.Enable, isDelete: false })
        .where(eq(users.username, "bob"));
      expect((await post(router, "/", input)).status).toBe(400);
      await harness.db.update(clients).set({ status: ClientStatus.Enable, isDelete: false });
      expect((await post(router, "/", input)).status).toBe(400);
    },
  );
});
