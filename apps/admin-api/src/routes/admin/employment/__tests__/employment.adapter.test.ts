import type { AdminApiRestContext } from "@admin-api/lib/admin-api-adapter";
import type { Context } from "hono";
import { UserNotFoundError } from "@iam/domain/user";
import { TRPCError } from "@trpc/server";
import { describe, expect, mock, test } from "bun:test";
import { createEmploymentAdapter } from "../employment.adapter";

function createRestContext(username: string) {
  return {
    get: mock((key: string) => {
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      if (key === "requestId")
        return "req-1";
      if (key === "traceId")
        return "trace-1";
      return undefined;
    }),
    req: {
      header: mock((name: string) => name === "x-trace-id" ? "trace-1" : undefined),
      method: "POST",
      path: `/admin/employments/${username}/resign`,
      valid: mock(() => ({ username })),
    },
    json: mock((body: unknown) => body),
  } as unknown as AdminApiRestContext & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("admin employment adapter", () => {
  test("delegates REST resignation to the independent use-case facade", async () => {
    const execute = mock(async () => true as const);
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const context = createRestContext("zhangsan");

    await expect(adapter.employmentsResignUser(
      context as unknown as Parameters<typeof adapter.employmentsResignUser>[0],
      async () => {},
    )).resolves.toMatchObject({ code: 200 });

    expect(execute).toHaveBeenCalledWith(
      { username: "zhangsan" },
      { auditContext: expect.objectContaining({
        actorType: "admin",
        actorUserId: 1001,
        actorUsername: "admin",
        requestId: "req-1",
        traceId: "trace-1",
      }) },
    );
    expect(context.json).toHaveBeenCalledWith({
      code: 200,
      data: true,
      message: "success",
    }, 200);
  });

  test("keeps the tRPC resignUser key, input, result, and normalized audit context", async () => {
    const execute = mock(async () => true as const);
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const context = createRestContext("zhangsan");
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: context as unknown as Context,
    });

    await expect(caller.resignUser({ username: "zhangsan" })).resolves.toBe(true);
    expect(execute).toHaveBeenCalledWith(
      { username: "zhangsan" },
      { auditContext: expect.objectContaining({
        actorType: "admin",
        actorUserId: 1001,
        requestId: "req-1",
        traceId: "trace-1",
      }) },
    );
  });

  test("preserves REST errors and normalizes tRPC user-not-found errors", async () => {
    const error = new UserNotFoundError("用户不存在");
    const execute = mock(async () => {
      throw error;
    });
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const restContext = createRestContext("missing");

    await expect(adapter.employmentsResignUser(
      restContext as unknown as Parameters<typeof adapter.employmentsResignUser>[0],
      async () => {},
    )).rejects.toBe(error);

    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("missing") as unknown as Context,
    });
    try {
      await caller.resignUser({ username: "missing" });
      throw new Error("expected tRPC resignation to fail");
    }
    catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
      expect((err as TRPCError).message).toBe("用户不存在");
    }
  });

  test("keeps non-resignation operations on EmploymentService", async () => {
    const setPrimaryEmployment = mock(async () => true);
    const execute = mock(async () => true as const);
    const adapter = createEmploymentAdapter({
      employmentService: { setPrimaryEmployment },
      resignUser: { execute },
    } as any);
    const context = createRestContext("unused");
    context.req.valid.mockImplementation(() => ({ id: 4 }));

    await expect(adapter.employmentsSetPrimary(
      context as unknown as Parameters<typeof adapter.employmentsSetPrimary>[0],
      async () => {},
    )).resolves.toMatchObject({ code: 200 });

    expect(setPrimaryEmployment).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ actorType: "admin", actorUserId: 1001 }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
