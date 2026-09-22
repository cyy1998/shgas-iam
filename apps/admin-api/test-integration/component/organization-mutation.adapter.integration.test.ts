import type { Organization } from "@iam/domain/organization";
import type { Context } from "hono";
import { createOrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import { createOrganizationRoute } from "@admin-api/routes/admin/organization/organization.index";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { getApiRuntimeErrorFormatterData } from "@iam/api-core/trpc";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware, getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

function surface(roles = ["iam:admin"]) {
  const now = new Date("2026-09-07T00:00:00Z");
  let row: Organization | null = null;
  const repository = {
    getAnyOrganizationByCode: async (code: string) => row?.orgCode === code ? row : null,
    lockOrganizationByCode: async (code: string) => row?.orgCode === code && !row.isDelete ? row : null,
    setOrganization: async (data: { orgCode: string; orgName: string }) => {
      row = {
        ...data,
        id: 1,
        status: OrganizationStatus.Enable,
        parentId: -1,
        businessParentId: -1,
        path: "/1",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
        orderNum: 0,
        isVirtual: false,
        isEntity: true,
        isDelete: false,
        createTime: now,
        updateTime: now,
      };
      return { ...row, parent: null, children: [] };
    },
    updateOrganizationByCode: async (_code: string, data: object) => row = row ? { ...row, ...data } : null,
    softDeleteOrganizationByCode: async () => row = row ? { ...row, isDelete: true } : null,
    countActiveChildrenByOrgCode: async () => 0,
    getOrganizationByCode: async () => null,
    getOrganizationByCodeForAdmin: async () => null,
    countOpenEmploymentsByOrgCode: async () => 0,
  };
  const recordAuditLog = mock(async () => undefined);
  const service = createOrganizationService({
    organizationRepository: {} as never,
    responsibilityReader: {} as never,
    uow: createImmediateUnitOfWork({
      organizationRepository: repository,
      responsibilityParentLifecycle: { assertNoOpenAssignmentsTargetingOrganizationSubtree: async () => undefined },
      auditService: {
        recordAuditLog,
        recordAuditLogFromContext: async () => undefined,
      },
      userProfileInvalidation: { recordChanges: async () => undefined },
    }),
  });
  const adapter = createOrganizationAdapter({ organizationService: service });
  const app = new Hono();
  addTestAdminAuthorizationMiddleware(app, roles);
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() } as never));
  app.route("/admin", createOrganizationRoute(adapter));
  const caller = adapter.organizationAdminRouter.createCaller({ hono: {
    get: (key: string) => key === "userId" ? 1 : key === "username" ? "admin" : getTestAdminAuthorizationValue(key),
    req: { header: () => undefined },
  } as unknown as Context });
  async function request(method: string, path: string, body?: object) {
    const response = await app.request(`/admin/organizations${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, caller, recordAuditLog };
}

describe("Organization mutation public adapters", () => {
  test("REST normalizes organization code and name before creating", async () => {
    const { request } = surface();
    const created = await request("POST", "", {
      orgCode: "  DEV  ",
      orgName: "  Developer  ",
      orgType: OrganizationType.Company,
    });

    expect(created).toMatchObject({
      status: 200,
      body: {
        data: {
          changed: true,
          result: { orgCode: "DEV", orgName: "Developer" },
        },
      },
    });
  });

  test("REST accepts a 64-character organization code", async () => {
    const { request } = surface();
    const accepted = await request("POST", "", {
      orgCode: "A".repeat(64),
      orgName: "Accepted",
      orgType: OrganizationType.Company,
    });
    expect(accepted.status).toBe(200);
  });

  test("REST rejects a 65-character organization code", async () => {
    const { request } = surface();
    const rejected = await request("POST", "", {
      orgCode: "B".repeat(65),
      orgName: "Rejected",
      orgType: OrganizationType.Company,
    });
    expect(rejected.status).toBe(422);
  });

  test.each([
    {
      field: "organization code",
      input: { orgCode: "   ", orgName: "Name", orgType: OrganizationType.Company },
    },
    {
      field: "organization name",
      input: { orgCode: "ORG", orgName: "   ", orgType: OrganizationType.Company },
    },
  ])("REST rejects a blank $field after normalization", async ({ input }) => {
    const { request } = surface();
    const rejected = await request("POST", "", input);
    expect(rejected.status).toBe(422);
  });

  test("tRPC normalizes organization code and name before creating", async () => {
    const { caller } = surface();
    const created = await caller.create({
      orgCode: "  DEV  ",
      orgName: "  Developer  ",
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Enable,
    });
    expect(created).toMatchObject({
      changed: true,
      result: { orgCode: "DEV", orgName: "Developer" },
    });
  });

  test("tRPC normalizes update fields before the no-op decision", async () => {
    const { caller } = surface();
    await caller.create({
      orgCode: "DEV",
      orgName: "Developer",
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Enable,
    });
    const unchanged = await caller.update({
      orgCode: "DEV",
      data: { orgCode: "  DEV  ", orgName: "  Developer  " },
    });
    expect(unchanged).toEqual({ changed: false, result: null });
  });

  test("tRPC rejects a 65-character organization code on update", async () => {
    const { caller } = surface();
    let failure: unknown;
    try {
      await caller.update({
        orgCode: "DEV",
        data: { orgCode: "X".repeat(65) },
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "BAD_REQUEST" });
  });

  test("REST preserves the envelope and returns created resource, changed and no-op results", async () => {
    const { request } = surface();
    const created = await request("POST", "", { orgCode: "DEV", orgName: "Developer", orgType: OrganizationType.Company, unexpected: "private" });
    expect(created).toMatchObject({ status: 200, body: { data: { changed: true, result: { id: 1, orgCode: "DEV" } } } });
    expect(created.body).toMatchObject({ data: { result: { orgCode: "DEV" } } });
    const empty = await request("PUT", "/DEV", {});
    expect(empty.status).toBe(400);
    const unchanged = await request("PUT", "/DEV", { orgName: "Developer" });
    expect(unchanged.body).toMatchObject({ data: { changed: false, result: null } });
    const changed = await request("PUT", "/DEV", { orgName: "Engineer" });
    expect(changed.body).toMatchObject({ data: { changed: true, result: null } });
    const status = await request("PATCH", "/DEV/status", { status: OrganizationStatus.Enable });
    expect(status.body).toMatchObject({ data: { changed: false, result: null } });
    const duplicate = await request("POST", "", { orgCode: "DEV", orgName: "Duplicate", orgType: OrganizationType.Company });
    expect(duplicate.status).toBe(409);
    const deleted = await request("DELETE", "/DEV");
    expect(deleted.body).toMatchObject({ data: { changed: true, result: null } });
    const missing = await request("DELETE", "/DEV");
    expect(missing.status).toBe(404);
  });

  test.each([OrganizationStatus.Pause, OrganizationStatus.Disable])("rejects explicit initial state %s on both transports", async (status) => {
    const { request, caller, recordAuditLog } = surface();
    const input = { orgCode: "BAD", orgName: "Bad", orgType: OrganizationType.Company, status };
    const rest = await request("POST", "", input);
    expect(rest.status).toBe(422);
    let failure: unknown;
    try {
      await caller.create(input as never);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "BAD_REQUEST" });
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  test("tRPC returns business results directly for all four commands", async () => {
    const { caller } = surface();
    const created = await caller.create({ orgCode: "DEV", orgName: "Developer", orgType: OrganizationType.Company, status: OrganizationStatus.Enable });
    expect(created).toMatchObject({ changed: true, result: { orgCode: "DEV" } });
    const update = await caller.update({ orgCode: "DEV", data: { orgName: "Engineer" } });
    expect(update).toEqual({ changed: true, result: null });
    const status = await caller.updateStatus({ orgCode: "DEV", status: OrganizationStatus.Enable });
    expect(status).toEqual({ changed: false, result: null });
    const deleted = await caller.delete({ orgCode: "DEV" });
    expect(deleted).toEqual({ changed: true, result: null });
    let missing: unknown;
    try {
      await caller.delete({ orgCode: "DEV" });
    }
    catch (error) {
      missing = error;
    }
    expect(missing).toMatchObject({ code: "NOT_FOUND" });
  });

  test("authorization rejects HR mutations before revealing target existence", async () => {
    const { request } = surface(["iam:hr-admin"]);
    const result = await request("DELETE", "/missing");
    expect(result.status).toBe(403);
  });

  test("REST PUT and tRPC update both retain no-op status intent", async () => {
    const { request, caller, recordAuditLog } = surface();
    await caller.create({ orgCode: "DEV", orgName: "Developer", orgType: OrganizationType.Company, status: OrganizationStatus.Enable });
    recordAuditLog.mockClear();
    const rest = await request("PUT", "/DEV", { status: OrganizationStatus.Enable });
    expect(rest).toMatchObject({ status: 200, body: { data: { changed: false, result: null } } });
    const trpc = await caller.update({ orgCode: "DEV", data: { status: OrganizationStatus.Enable } });
    expect(trpc).toEqual({ changed: false, result: null });
    expect(recordAuditLog).toHaveBeenCalledTimes(2);
    expect(recordAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "admin.organization.update",
      details: expect.objectContaining({ changed: false }),
    }));
    expect(recordAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "admin.organization.update",
      details: expect.objectContaining({ changed: false }),
    }));
  });

  test("committed failure has a stable transport classification without exposing a cause", () => {
    const error = new AdminMutationCommittedError();
    expect(getApiRuntimeErrorFormatterData(error)).toMatchObject({ serviceCode: "ADMIN_MUTATION_COMMITTED", httpStatus: 500 });
    expect(error.cause).toBeUndefined();
  });
});
