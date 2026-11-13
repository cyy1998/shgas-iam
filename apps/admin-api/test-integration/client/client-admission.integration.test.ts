import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createAdminApiRouteComposition } from "@admin-api/composition/routes";
import { createClientAdmissionManagement } from "@admin-api/composition/services/client-admission-management";
import { createAdminRestAuthorizationHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { addTestAdminAuthorizationMiddleware } from "@admin-api/testing/admin-authorization";
import { createRouter } from "@iam/api-core/core/create-router";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  ApiErrorCode,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  RoleAssignmentTargetType,
  RoleType,
  UserType,
} from "@iam/contracts";
import {
  auditLogs,
  clients,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  roles,
  userDocuments,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createCurrentUserDocumentProjectionBundle } from "@iam/documents/user/worker";
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
  await harness.db.insert(clients).values([
    { clientCode: "expense", clientName: "报销", clientSecret: "synthetic", extAttributes: {} },
    { clientCode: "admin-portal", clientName: "管理后台", clientSecret: "synthetic", extAttributes: {} },
    { clientCode: "unrelated", clientName: "其他应用", clientSecret: "synthetic", extAttributes: {} },
  ]);
});
afterAll(async () => {
  await harness?.close();
});

const logger = { bindings: () => ({}), error() {}, warn() {}, info() {} };
const path = "/admin/clients/expense/admission";

function app(
  roles = ["iam:admin"],
  invalidateClient: (clientCode: string) => Promise<void> = async () => {},
  requestLogger = logger,
) {
  const candidate = createAdminApiRouteComposition({
    auditService: {},
    runtime: { random: {} },
    services: {
      client: {},
      clientAdmission: createClientAdmissionManagement({
        db: harness.db,
        adminClientCodes: ["admin-portal"],
        invalidation: { invalidateClient },
        logger,
      }),
      clientSso: { service: {} },
    },
    useCases: {
      employment: {},
      organizationResponsibility: {},
    },
  } as never);
  const router = createRouter();
  addTestAdminAuthorizationMiddleware(router as never, roles);
  router.onError(createErrorHandler(requestLogger as never));
  router.use("/admin/*", async (c, next) => {
    c.set("tierBasePath" as never, "/admin" as never);
    await next();
  });
  router.use("/admin/*", createAdminRestAuthorizationHandler(candidate.restOperationSurface));
  const admission = candidate.routes["./src/routes/admin/client-admission/client-admission.index.ts"];
  if (!admission) throw new Error("Application admission REST route is not mounted");
  router.route("/admin", admission.default);
  router.all("/rpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: candidate.appRouter,
      createContext: () => ({ hono: c }),
    }),
  );
  return router;
}

async function responseData(response: Response) {
  return z.object({ data: z.unknown() }).parse(await response.json()).data;
}

const allowedActions = { save: true, preview: true, setEnabled: true };

test("a rolled-back policy save hides database diagnostics from the response and request logs", async () => {
  const errors: unknown[] = [];
  let invalidations = 0;
  const application = app(
    ["iam:admin"],
    async () => {
      invalidations++;
    },
    {
      ...logger,
      error(fields?: unknown) {
        errors.push(fields);
      },
    },
  );
  const filter = { field: "username", op: "eq", value: "admission-private-rule" };
  await harness.sql`
    create function admission_test_write_failure() returns trigger language plpgsql as $$
    begin
      raise exception using errcode = '22000', message = new.admission_filter->>'value';
    end $$`;
  try {
    await harness.sql`
      create trigger admission_test_write_failure before update of admission_filter on client
      for each row execute function admission_test_write_failure()`;
    const failed = await application.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter }),
    });
    expect(failed.status).toBe(500);
    const response = await failed.json();
    expect(response).toMatchObject({ code: ApiErrorCode.InternalError });
    expect(JSON.stringify(response)).not.toContain(filter.value);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ errorMessage: "Client admission policy storage update failed" });
    expect(Bun.inspect(errors)).not.toContain(filter.value);
    expect(invalidations).toBe(0);
    const policy = await application.request(path);
    expect(await responseData(policy)).toEqual({ enabled: false, filter: null, allowedActions });
    const audit = await harness.db.select().from(auditLogs).where(eq(auditLogs.targetCode, "expense"));
    expect(audit).toEqual([]);
  } finally {
    await harness.sql`drop trigger if exists admission_test_write_failure on client`;
    await harness.sql`drop function admission_test_write_failure()`;
  }
});

test("a new business Client has a disabled application admission policy without a saved expression", async () => {
  const response = await app().request(path);
  expect(response.status).toBe(200);
  expect(await responseData(response)).toEqual({ enabled: false, filter: null, allowedActions });
});

const formal = { field: "userType", op: "eq", value: UserType.Formal } as const;

function post(application: ReturnType<typeof app>, url: string, body: unknown) {
  return application.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("saving an application admission expression persists the policy while disabled and records redacted audit", async () => {
  const application = app();
  const saved = await post(application, path, { filter: formal });
  expect(saved.status).toBe(200);
  expect(await responseData(saved)).toEqual({ changed: true, result: { enabled: false, filter: formal } });

  const reopened = await app().request(path);
  expect(await responseData(reopened)).toEqual({ enabled: false, filter: formal, allowedActions });

  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    action: "admin.client.admission.save",
    targetCode: "expense",
    details: { changed: true, enabled: false },
  });
  expect(JSON.stringify(audits[0]?.details)).not.toContain(UserType.Formal);
  expect(JSON.stringify(audits[0]?.details)).not.toContain("userType");
});

test("full administrators can enable, disable and re-enable a saved condition for only the target application", async () => {
  const application = app();
  const enabledPath = `${path}/enabled`;
  const withoutCondition = await post(application, enabledPath, { enabled: true });
  expect(withoutCondition.status).toBe(400);

  const filter = { field: "username", op: "eq", value: "admission-condition-sentinel" };
  const saved = await post(application, path, { filter });
  expect(saved.status).toBe(200);
  const before = await application.request(path);
  expect(await responseData(before)).toEqual({ enabled: false, filter, allowedActions });

  for (const enabled of [true, false, true]) {
    const update = await post(application, enabledPath, { enabled });
    expect(update.status).toBe(200);
    expect(await responseData(update)).toEqual({ changed: true, result: { enabled } });
    const detail = await application.request(path);
    expect(await responseData(detail)).toEqual({ enabled, filter, allowedActions });
  }

  const noChange = await post(application, "/rpc/admin.clientAdmission.setEnabled", {
    clientCode: "expense",
    data: { enabled: true },
  });
  expect(noChange.status).toBe(200);
  expect(await noChange.json()).toEqual({ result: { data: { changed: false, result: { enabled: true } } } });

  const unrelated = await application.request("/admin/clients/unrelated/admission");
  expect(await responseData(unrelated)).toEqual({ enabled: false, filter: null, allowedActions });
  const audits = await harness.db.select().from(auditLogs).orderBy(auditLogs.id);
  expect(audits.map(({ action, targetCode }) => ({ action, targetCode }))).toEqual([
    { action: "admin.client.admission.save", targetCode: "expense" },
    ...Array.from({ length: 4 }, () => ({ action: "admin.client.admission.enabled", targetCode: "expense" })),
  ]);
  expect(audits.map(({ details }) => details)).toEqual([
    { changed: true, enabled: false, targetName: "报销" },
    { changed: true, enabled: true, targetName: "报销" },
    { changed: true, enabled: false, targetName: "报销" },
    { changed: true, enabled: true, targetName: "报销" },
    { changed: false, enabled: true, targetName: "报销" },
  ]);
});

test("a stored object without a valid condition cannot be enabled", async () => {
  await harness.db
    .update(clients)
    .set({ admissionFilter: { and: [] } })
    .where(eq(clients.clientCode, "expense"));
  const rejected = await post(app(), `${path}/enabled`, { enabled: true });
  expect(rejected.status).toBe(400);
  const [client] = await harness.db.select().from(clients).where(eq(clients.clientCode, "expense"));
  expect(client).toMatchObject({ admissionEnabled: false, admissionFilter: { and: [] } });
  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(0);
});

test("tRPC returns only trial status for an unsaved condition", async () => {
  const application = app();
  const trial = await post(application, "/rpc/admin.clientAdmission.preview", {
    clientCode: "expense",
    data: { userId: 1, filter: formal },
  });
  expect(trial.status).toBe(200);
  expect(await trial.json()).toEqual({ result: { data: { status: "unavailable" } } });
});

test("trial evaluation uses published facts and leaves the saved policy and audit unchanged", async () => {
  const [user] = await harness.db
    .insert(users)
    .values({ username: "alice", name: "Alice", userType: UserType.Formal })
    .returning();
  if (!user) throw new Error("User fixture unavailable");
  const projection = createCurrentUserDocumentProjectionBundle();
  const document = await projection
    .createBuilder({
      db: harness.db,
      clock: { nowDate: () => new Date("2026-11-01T00:00:00Z") },
      batchSize: 1,
    })
    .buildOne({ userId: user.id, sourceVersion: "1" });
  if (!document) throw new Error("User Document fixture unavailable");
  await projection.createRowRepository(harness.db).upsert(document);
  await harness.db.update(users).set({ userType: UserType.External }).where(eq(users.id, user.id));

  const application = app();
  const match = await post(application, `${path}/preview`, { userId: user.id, filter: formal });
  expect(match.status).toBe(200);
  expect(await responseData(match)).toEqual({ status: "match" });

  const external = { ...formal, value: UserType.External };
  const mismatch = await post(application, `${path}/preview`, { userId: user.id, filter: external });
  expect(await responseData(mismatch)).toEqual({ status: "no-match" });

  const unchanged = await application.request(path);
  expect(await responseData(unchanged)).toEqual({ enabled: false, filter: null, allowedActions });
  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(0);
});

test("trial evaluates independently scoped employments, role visibility, subtrees and nulls against published documents", async () => {
  await harness.db.insert(clients).values({
    id: 10,
    clientCode: "other",
    clientName: "其他应用",
    clientSecret: "synthetic",
    extAttributes: {},
  });
  await harness.db.insert(users).values([
    { id: 10, username: "two-employments", name: "Two employments" },
    { id: 11, username: "no-employments", name: "No employments" },
  ]);
  await harness.db.insert(organizations).values([
    {
      id: 10,
      orgCode: "FIN",
      orgName: "Finance",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
      path: "/10",
    },
    {
      id: 11,
      orgCode: "PAY",
      orgName: "Payroll",
      orgType: OrganizationType.Department,
      level: OrganizationLevel.Two,
      path: "/10/11",
      parentId: 10,
    },
    {
      id: 12,
      orgCode: "OPS",
      orgName: "Operations",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
      path: "/12",
    },
  ]);
  await harness.db.insert(organizationClosures).values([
    { ancestorId: 10, descendantId: 10, depth: 0 },
    { ancestorId: 10, descendantId: 11, depth: 1 },
    { ancestorId: 11, descendantId: 11, depth: 0 },
    { ancestorId: 12, descendantId: 12, depth: 0 },
  ]);
  await harness.db.insert(positions).values([
    { id: 10, posCode: "PAYROLL", posName: "Payroll" },
    { id: 11, posCode: "APPROVER", posName: "Approver" },
  ]);
  await harness.db.insert(employments).values([
    { id: 10, userId: 10, posId: 10, orgId: 11, isPrimary: true, startTime: "2026-10-01" },
    { id: 11, userId: 10, posId: 11, orgId: 12, startTime: "2026-10-01" },
  ]);
  const [expense] = await harness.db.select({ id: clients.id }).from(clients).where(eq(clients.clientCode, "expense"));
  if (!expense) throw new Error("Expense client fixture unavailable");
  await harness.db.insert(roles).values([
    { id: 10, roleCode: "expense:approve", roleName: "Expense approver", clientId: expense.id },
    { id: 11, roleCode: "global:review", roleName: "Global reviewer", roleType: RoleType.Global },
    { id: 12, roleCode: "other:private", roleName: "Other private role", clientId: 10 },
  ]);
  await harness.db
    .insert(roleAssignments)
    .values([10, 11, 12].map((roleId) => ({ roleId, targetType: RoleAssignmentTargetType.Employment, targetId: 11 })));
  await harness.db.insert(organizationResponsibilityAssignments).values([
    {
      employmentId: 11,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 11,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-10-01T00:00:00Z"),
    },
    {
      employmentId: 11,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      targetOrganizationId: 12,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
  const projection = createCurrentUserDocumentProjectionBundle();
  const builder = projection.createBuilder({
    db: harness.db,
    clock: { nowDate: () => new Date("2026-11-01T00:00:00Z") },
    batchSize: 1,
  });
  const publications = projection.createRowRepository(harness.db);
  async function publish(userId: number, sourceVersion: string) {
    const document = await builder.buildOne({ userId, sourceVersion });
    if (!document) throw new Error("User Document fixture unavailable");
    await publications.upsert(document);
  }
  await publish(10, "1");
  await publish(11, "1");

  const application = app();
  async function preview(userId: number, filter: unknown, expected: "match" | "no-match") {
    const trial = await post(application, `${path}/preview`, { userId, filter });
    expect(trial.status).toBe(200);
    expect(await responseData(trial)).toEqual({ status: expected });
  }
  const hasEmployment = (where: unknown) => ({ exists: { path: "employments", where } });
  const orgSubtree = (code: string) => ({
    exists: { path: "organization.path", where: { field: "code", op: "eq", value: code } },
  });
  const finance = orgSubtree("FIN");
  const approver = { field: "position.code", op: "eq", value: "APPROVER" };
  const canReview = { field: "roles", op: "containsAll", value: ["expense:approve", "global:review"] };
  const privateRole = { field: "roles", op: "containsAny", value: ["other:private"] };
  const missingMobile = { field: "mobile", op: "eq", value: "13000000001" };
  await preview(10, hasEmployment({ and: [finance, approver, canReview] }), "no-match");
  await preview(10, { and: [hasEmployment(finance), hasEmployment({ and: [approver, canReview] })] }, "match");
  await preview(10, hasEmployment(orgSubtree("OPS")), "match");
  await preview(10, hasEmployment(privateRole), "no-match");
  await preview(10, { not: hasEmployment(privateRole) }, "match");
  await preview(10, missingMobile, "no-match");
  await preview(10, { not: missingMobile }, "match");
  await preview(11, { and: [{ not: missingMobile }, { not: hasEmployment(finance) }] }, "match");
  const head = { field: "type.code", op: "eq", value: OrganizationResponsibilityTypeCode.Head };
  const hasResponsibility = (where: unknown) => hasEmployment({ exists: { path: "responsibilities", where } });
  const responsibilityPath = (distanceToTarget: number) => ({
    exists: {
      path: "targetOrganization.path",
      where: {
        and: [
          { field: "code", op: "eq", value: "FIN" },
          { field: "distanceToTarget", op: "eq", value: distanceToTarget },
        ],
      },
    },
  });
  await preview(10, hasResponsibility({ and: [head, responsibilityPath(1)] }), "match");
  await preview(10, hasResponsibility({ and: [head, responsibilityPath(0)] }), "no-match");
  await preview(
    10,
    hasResponsibility({
      and: [head, { field: "targetOrganization.code", op: "eq", value: "OPS" }],
    }),
    "no-match",
  );

  const saved = await post(application, path, { filter: hasEmployment(finance) });
  expect(saved.status).toBe(200);
  await harness.db.update(organizations).set({ orgCode: "FIN-NEW" }).where(eq(organizations.id, 10));
  await preview(10, hasEmployment(finance), "match");
  await publish(10, "2");
  await preview(10, hasEmployment(finance), "no-match");
  await harness.db.update(organizations).set({ orgCode: "FIN" }).where(eq(organizations.id, 12));
  await publish(10, "3");
  const reopened = await application.request(path);
  expect(await responseData(reopened)).toEqual({ enabled: false, filter: hasEmployment(finance), allowedActions });
  await preview(10, hasEmployment(finance), "match");
});

test.each([
  { and: [] },
  { field: "password", op: "eq", value: "synthetic" },
  { field: "userType", op: "eq", value: 1 },
  { field: "userType", op: "eq", value: "other" },
  { field: "userType", op: "containsAny", value: [UserType.Formal] },
  { and: Array.from({ length: 17 }, () => formal) },
  Array.from({ length: 9 }).reduce<unknown>((child) => ({ not: child }), formal),
])("invalid or over-budget conditions are rejected by the application management API (%j)", async (filter) => {
  const application = app();
  const saved = await post(application, path, { filter });
  expect([400, 422]).toContain(saved.status);
  const trial = await post(application, `${path}/preview`, { userId: 1, filter });
  expect([400, 422]).toContain(trial.status);
  const reopened = await application.request(path);
  expect(await responseData(reopened)).toEqual({ enabled: false, filter: null, allowedActions });
  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(0);
});

test("HR cannot manage admission and full administrators cannot configure a management Client", async () => {
  const hr = app(["iam:hr-admin"]);
  const manage = app();
  for (const [application, target, status] of [
    [hr, path, 403],
    [manage, "/admin/clients/admin-portal/admission", 404],
  ] as const) {
    const detail = await application.request(target);
    expect(detail.status).toBe(status);
    const saved = await post(application, target, { filter: formal });
    expect(saved.status).toBe(status);
    const trial = await post(application, `${target}/preview`, { userId: 1, filter: formal });
    expect(trial.status).toBe(status);
    const enabled = await post(application, `${target}/enabled`, { enabled: true });
    expect(enabled.status).toBe(status);
  }
  const hrRpc = await post(hr, "/rpc/admin.clientAdmission.setEnabled", {
    clientCode: "expense",
    data: { enabled: false },
  });
  expect(hrRpc.status).toBe(403);
  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(0);
});

test("an absent, tombstoned or invalid publication is temporarily unavailable, even if a condition could match", async () => {
  const [user] = await harness.db.insert(users).values({ username: "alice", name: "Alice" }).returning();
  if (!user) throw new Error("User fixture unavailable");
  const application = app();
  const input = { userId: user.id, filter: formal };
  const missing = await post(application, `${path}/preview`, input);
  expect(await responseData(missing)).toEqual({ status: "unavailable" });

  const metadata = {
    userId: user.id,
    subjectIdentifier: user.subjectIdentifier,
    schemaVersion: 1,
    sourceVersion: "1",
    publishedAt: new Date("2026-11-01T00:00:00Z"),
  };
  await harness.db.insert(userDocuments).values({ ...metadata, document: null });
  const tombstoned = await post(application, `${path}/preview`, input);
  expect(await responseData(tombstoned)).toEqual({ status: "unavailable" });

  await harness.db
    .update(userDocuments)
    .set({ document: { subjectIdentifier: user.subjectIdentifier, userType: UserType.Formal, employments: [] } })
    .where(eq(userDocuments.userId, user.id));
  const invalid = await post(application, `${path}/preview`, input);
  expect(await responseData(invalid)).toEqual({ status: "unavailable" });
});

test("a failure propagating a committed save reports the existing recovery result and preserves the redacted audit", async () => {
  let invalidations = 0;
  const application = app(undefined, async (clientCode) => {
    expect(clientCode).toBe("expense");
    invalidations++;
    throw new Error("Test snapshot unavailable");
  });
  const result = await post(application, path, { filter: formal });
  expect(result.status).toBe(500);
  expect(await result.json()).toMatchObject({ code: ApiErrorCode.AdminMutationCommitted });
  expect(invalidations).toBe(1);
  const reopened = await application.request(path);
  expect(await responseData(reopened)).toEqual({ enabled: false, filter: formal, allowedActions });
  const audits = await harness.db.select().from(auditLogs);
  expect(audits).toHaveLength(1);
  expect(audits[0]?.details).toMatchObject({ changed: true, enabled: false });
});
