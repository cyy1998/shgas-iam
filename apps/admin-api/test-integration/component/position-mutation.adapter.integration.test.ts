import type { Position } from "@iam/domain/position";
import type { Context } from "hono";
import { createPositionAdapter } from "@admin-api/routes/admin/position/position.adapter";
import { createPositionRoute } from "@admin-api/routes/admin/position/position.index";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { getApiRuntimeErrorFormatterData } from "@iam/api-core/trpc";
import { PositionStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware, getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

function surface(roles = ["iam:admin"]) {
  const now = new Date("2026-09-07T00:00:00Z");
  let row: Position | null = null;
  const repository = {
    getAnyPositionByCode: async (code: string) => row?.posCode === code ? row : null,
    lockPositionByCode: async (code: string) => row?.posCode === code && !row.isDelete ? row : null,
    setPosition: async (data: { posCode: string; posName: string }) => {
      row = {
        ...data,
        id: 1,
        status: PositionStatus.Enable,
        description: null,
        isDelete: false,
        createTime: now,
        updateTime: now,
      };
      return row;
    },
    updatePositionByCode: async (_code: string, data: object) => row = row ? { ...row, ...data } : null,
    softDeletePositionByCode: async () => row = row ? { ...row, isDelete: true } : null,
    countOpenEmploymentsByPosCode: async () => 0,
  };
  const recordAuditLog = mock(async () => undefined);
  const service = createPositionService({
    positionRepository: { getPositionDetailByCode: async () => null, searchPositionsFuzzy: async () => [] },
    uow: createImmediateUnitOfWork({
      positionRepository: repository,
      auditService: {
        recordAuditLog,
        recordAuditLogFromContext: async () => undefined,
      },
      userProfileInvalidation: { recordChanges: async () => undefined },
    }),
  });
  const adapter = createPositionAdapter({ positionService: service });
  const app = new Hono();
  addTestAdminAuthorizationMiddleware(app, roles);
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() } as never));
  app.route("/admin", createPositionRoute(adapter));
  const caller = adapter.positionAdminRouter.createCaller({ hono: {
    get: (key: string) => key === "userId" ? 1 : key === "username" ? "admin" : getTestAdminAuthorizationValue(key),
    req: { header: () => undefined },
  } as unknown as Context });
  async function request(method: string, path: string, body?: object) {
    const response = await app.request(`/admin/positions${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, caller, recordAuditLog };
}

describe("Position mutation public adapters", () => {
  test("REST preserves the envelope and returns created resource, changed and no-op results", async () => {
    const { request } = surface();
    const created = await request("POST", "", { posCode: "DEV", posName: "Developer", unexpected: "private" });
    expect(created).toMatchObject({ status: 200, body: { data: { changed: true, result: { id: 1, posCode: "DEV" } } } });
    expect(created.body).toMatchObject({ data: { result: { posCode: "DEV" } } });
    const empty = await request("PUT", "/DEV", {});
    expect(empty.status).toBe(400);
    const unchanged = await request("PUT", "/DEV", { posName: "Developer" });
    expect(unchanged.body).toMatchObject({ data: { changed: false, result: null } });
    const changed = await request("PUT", "/DEV", { posName: "Engineer" });
    expect(changed.body).toMatchObject({ data: { changed: true, result: null } });
    const status = await request("PATCH", "/DEV/status", { status: PositionStatus.Enable });
    expect(status.body).toMatchObject({ data: { changed: false, result: null } });
    const duplicate = await request("POST", "", { posCode: "DEV", posName: "Duplicate" });
    expect(duplicate.status).toBe(409);
    const deleted = await request("DELETE", "/DEV");
    expect(deleted.body).toMatchObject({ data: { changed: true, result: null } });
    const missing = await request("DELETE", "/DEV");
    expect(missing.status).toBe(404);
  });

  test("tRPC returns business results directly for all four commands", async () => {
    const { caller } = surface();
    const created = await caller.create({ posCode: "DEV", posName: "Developer", status: PositionStatus.Enable });
    expect(created).toMatchObject({ changed: true, result: { posCode: "DEV" } });
    const update = await caller.update({ posCode: "DEV", data: { posName: "Engineer" } });
    expect(update).toEqual({ changed: true, result: null });
    const status = await caller.updateStatus({ posCode: "DEV", status: PositionStatus.Enable });
    expect(status).toEqual({ changed: false, result: null });
    const deleted = await caller.delete({ posCode: "DEV" });
    expect(deleted).toEqual({ changed: true, result: null });
    let missing: unknown;
    try {
      await caller.delete({ posCode: "DEV" });
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
    await caller.create({ posCode: "DEV", posName: "Developer", status: PositionStatus.Enable });
    recordAuditLog.mockClear();
    const rest = await request("PUT", "/DEV", { status: PositionStatus.Enable });
    expect(rest).toMatchObject({ status: 200, body: { data: { changed: false, result: null } } });
    const trpc = await caller.update({ posCode: "DEV", data: { status: PositionStatus.Enable } });
    expect(trpc).toEqual({ changed: false, result: null });
    expect(recordAuditLog).toHaveBeenCalledTimes(2);
    expect(recordAuditLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: "admin.position.update",
      details: expect.objectContaining({ changed: false }),
    }));
    expect(recordAuditLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: "admin.position.update",
      details: expect.objectContaining({ changed: false }),
    }));
  });

  test("committed failure has a stable transport classification without exposing a cause", () => {
    const error = new AdminMutationCommittedError();
    expect(getApiRuntimeErrorFormatterData(error)).toMatchObject({ serviceCode: "ADMIN_MUTATION_COMMITTED", httpStatus: 500 });
    expect(error.cause).toBeUndefined();
  });
});
