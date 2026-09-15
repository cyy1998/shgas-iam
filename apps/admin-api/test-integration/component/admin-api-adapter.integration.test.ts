import type { AdminApiRestContext } from "@admin-api/lib/admin-api-adapter";
import type { RouteHandler } from "@hono/zod-openapi";
import type { ApiEnvelope } from "@iam/api-core/http";
import type { Context } from "hono";
import { createAdminApiRouteComposition } from "@admin-api/composition/routes";
import { defineAdminApiOperation } from "@admin-api/lib/admin-api-adapter";
import { createAdminRestAuthorizationHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createRoute } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import { NOT_FOUND, OK } from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { CustomError } from "@iam/api-core/errors";
import { router } from "@iam/api-core/trpc";
import { TRPCError } from "@trpc/server";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsEqual<TActual, TExpected> = (
  <T>() => T extends TActual ? 1 : 2
) extends (
  <T>() => T extends TExpected ? 1 : 2
) ? true : false;
type Assert<T extends true> = T;
type AssertFalse<T extends false> = T;

const typedObjectOutputRoute = createRoute({
  method: "get",
  path: "/typed-object-output",
  responses: {
    [OK]: jsonContent(createSuccessResponseSchema(z.object({
      id: z.string(),
    })), "ok"),
  },
});

const typedStringOutputRoute = createRoute({
  method: "get",
  path: "/typed-string-output",
  responses: {
    [OK]: jsonContent(createSuccessResponseSchema(z.string()), "ok"),
  },
});

const userCreateInputRoute = createRoute({
  method: "post",
  path: "/users",
  request: {
    body: jsonContent(z.object({ username: z.string() }), "input"),
  },
  responses: {
    [OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "ok"),
  },
});

const userDetailInputRoute = createRoute({
  method: "get",
  path: "/users/:username",
  request: {
    params: z.object({ username: z.string() }),
    query: z.object({ confirmation: z.literal("yes") }),
  },
  responses: {
    [OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "ok"),
  },
});

type ObjectOutputRouteHandler = RouteHandler<typeof typedObjectOutputRoute>;
type StringOutputRouteHandler = RouteHandler<typeof typedStringOutputRoute>;

const typedObjectOutputOperation = defineAdminApiOperation({
  type: "query",
  operationId: "admin.user.search",
  input: z.object({}),
  restInput: () => ({}),
  handler: async (): Promise<{ id: string }> => ({ id: "u-1" }),
});

const generatedObjectOutputHandler = typedObjectOutputOperation.toHandler();
typedObjectOutputOperation.toHandler<ObjectOutputRouteHandler>();
// @ts-expect-error operation output object is not assignable to a string success response schema
typedObjectOutputOperation.toHandler<StringOutputRouteHandler>();

type _GeneratedHandlerReturnIsNotAny = AssertFalse<IsAny<Awaited<ReturnType<typeof generatedObjectOutputHandler>>>>;
type _GeneratedHandlerEnvelopeCode = Assert<
  IsEqual<Awaited<ReturnType<typeof generatedObjectOutputHandler>>["_data"]["code"], 200>
>;
type _GeneratedHandlerEnvelopeData = Assert<
  IsEqual<Awaited<ReturnType<typeof generatedObjectOutputHandler>>["_data"]["data"], { id: string }>
>;
type _GeneratedHandlerEnvelopeAssignable = Assert<
  Awaited<ReturnType<typeof generatedObjectOutputHandler>>["_data"] extends ApiEnvelope<{ id: string }, 200>
    ? true
    : false
>;

void typedObjectOutputRoute;
void typedStringOutputRoute;
void generatedObjectOutputHandler;

function createPolicy(
  logger: { warn: (fields: Record<string, unknown>, message: string) => void },
) {
  return createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: {
      resolveForActor: async () => null,
    },
    logger,
  });
}

function createProductionRestOperationSurface() {
  return createAdminApiRouteComposition({
    auditService: {},
    runtime: { random: {} },
    services: {
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
      organizationResponsibility: {
        createAssignment: {},
        manageAssignmentLifecycle: {},
      },
    },
  } as never).restOperationSurface;
}

function createRestContext(valid: Record<string, unknown>) {
  const policy = createPolicy({ warn: mock() });
  return {
    get: mock((key: string) => {
      if (key === "adminAuthorizationPolicy")
        return policy;
      if (key === "userId")
        return 1;
      if (key === "username")
        return "admin";
      if (key === "userDetailDto")
        return { roles: ["iam:admin"] };
      return undefined;
    }),
    req: {
      valid: mock((target: string) => valid[target]),
    },
    json: mock((body: unknown) => body),
  } as unknown as AdminApiRestContext & {
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

function createDeeplyNestedObject(depth: number) {
  let input: Record<string, unknown> = {};
  for (let index = 0; index < depth; index += 1)
    input = { nested: input };
  return input;
}

function createDeeplyNestedJson(depth: number) {
  return `${"{\"nested\":".repeat(depth)}{}${"}".repeat(depth)}`;
}

function createWideJson(width: number) {
  const entries = Array.from(
    { length: width },
    (_, index) => `\"entry${index}\":{}`,
  );
  entries.push("\"last\":{\"username\":\"hidden\"}");
  return `{${entries.join(",")}}`;
}

describe("defineAdminApiOperation", () => {
  test("rejects the same unauthorized mutation before REST or tRPC side effects", async () => {
    const handler = mock(async () => true);
    const policy = createPolicy({ warn: mock() });
    const context = {
      get: mock((key: string) => {
        if (key === "adminAuthorizationPolicy")
          return policy;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "ordinary";
        if (key === "userDetailDto")
          return { roles: ["iam:user"] };
        return undefined;
      }),
      req: {
        valid: mock(() => ({ username: "zhangsan" })),
      },
      json: mock((body: unknown) => body),
    } as unknown as AdminApiRestContext;
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.delete",
      input: z.object({ username: z.string() }),
      restInput: c => c.req.valid("param") as { username: string },
      handler,
    });

    let restFailure: unknown;
    try {
      await operation.toHandler()(context);
    }
    catch (error) {
      restFailure = error;
    }
    expect(restFailure).toMatchObject({ httpStatus: 403 });

    const caller = router({ remove: operation.toTRPC() }).createCaller({
      hono: context,
    });
    let trpcFailure: unknown;
    try {
      await caller.remove({ username: "zhangsan" });
    }
    catch (error) {
      trpcFailure = error;
    }
    expect(trpcFailure).toMatchObject({ code: "FORBIDDEN" });
    expect(handler).toHaveBeenCalledTimes(0);
  });

  test("rejects malformed REST and tRPC mutation input before schema disclosure", async () => {
    const handler = mock(async () => true);
    const warn = mock();
    const policy = createPolicy({ warn });
    const deeplyNestedInput = createDeeplyNestedObject(20_000);
    const context = {
      get: mock((key: string) => {
        if (key === "adminAuthorizationPolicy")
          return policy;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "ordinary";
        if (key === "userDetailDto")
          return { roles: ["iam:user"] };
        return undefined;
      }),
      req: { valid: mock(() => deeplyNestedInput) },
      json: mock(),
    } as unknown as AdminApiRestContext;
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.delete",
      input: z.object({ username: z.string() }),
      restInput: c => c.req.valid("param") as { username: string },
      handler,
    });

    let restFailure: unknown;
    try {
      await operation.toHandler()(context);
    }
    catch (error) {
      restFailure = error;
    }
    expect(restFailure).toMatchObject({ httpStatus: 403 });

    const caller = router({ remove: operation.toTRPC() }).createCaller({
      hono: context,
    });
    let trpcFailure: unknown;
    try {
      await caller.remove(deeplyNestedInput as never);
    }
    catch (error) {
      trpcFailure = error;
    }
    expect(trpcFailure).toMatchObject({ code: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls).toEqual(expect.arrayContaining([
      [expect.objectContaining({
        action: "admin.user.delete",
        resourceIdentifier: "collection",
        resourceType: "user",
      }), "admin mutation authorization denied"],
    ]));
  });

  test("bounds oversized REST and tRPC denial log identifiers", async () => {
    const handler = mock(async () => true);
    const warn = mock();
    const policy = createPolicy({ warn });
    const oversizedUsername = "x".repeat(100_000);
    const context = {
      get: mock((key: string) => {
        if (key === "adminAuthorizationPolicy")
          return policy;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "ordinary";
        if (key === "userDetailDto")
          return { roles: ["iam:user"] };
        return undefined;
      }),
      req: { valid: mock(() => ({ username: oversizedUsername })) },
      json: mock(),
    } as unknown as AdminApiRestContext;
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.delete",
      input: z.object({ username: z.string() }),
      restInput: c => c.req.valid("param") as { username: string },
      handler,
    });

    let restFailure: unknown;
    try {
      await operation.toHandler()(context);
    }
    catch (error) {
      restFailure = error;
    }
    expect(restFailure).toMatchObject({ httpStatus: 403 });

    const caller = router({ remove: operation.toTRPC() }).createCaller({
      hono: context,
    });
    let trpcFailure: unknown;
    try {
      await caller.remove({ username: oversizedUsername });
    }
    catch (error) {
      trpcFailure = error;
    }
    expect(trpcFailure).toMatchObject({ code: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [fields] of warn.mock.calls) {
      const identifier = (fields as { resourceIdentifier: string })
        .resourceIdentifier;
      expect(identifier).toHaveLength(128);
      expect(identifier.endsWith("...")).toBeTrue();
    }
  });

  test("denies an implicit HEAD request before executing its mounted GET handler", async () => {
    const handler = mock(async () => true);
    const policy = createPolicy({ warn: mock() });
    const operation = defineAdminApiOperation({
      type: "query",
      operationId: "admin.user.detail",
      input: z.object({ confirmation: z.literal("yes"), username: z.string() }),
      restInput: c => ({
        ...c.req.valid("param") as { username: string },
        ...c.req.valid("query") as { confirmation: "yes" },
      }),
      handler,
    });
    const route = createRouter().openapi(
      userDetailInputRoute,
      operation.toHandler<RouteHandler<typeof userDetailInputRoute>>() as never,
    );
    const app = new Hono();
    app.use("/admin/*", async (c, next) => {
      c.set("tierBasePath" as never, "/admin" as never);
      c.set("adminAuthorizationPolicy" as never, policy as never);
      c.set("userId" as never, 7 as never);
      c.set("username" as never, "ordinary" as never);
      c.set("userDetailDto" as never, { roles: ["iam:user"] } as never);
      await next();
    });
    app.use(
      "/admin/*",
      createAdminRestAuthorizationHandler(createProductionRestOperationSurface()),
    );
    app.route("/admin", route);
    app.onError((error, c) => c.text(
      error.message,
      ("httpStatus" in error ? error.httpStatus : 500) as never,
    ));

    const response = await app.request(
      "http://localhost/admin/users/zhangsan",
      { method: "HEAD" },
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test("authorizes an actual REST route before OpenAPI request validation", async () => {
    const handler = mock(async () => true);
    const warn = mock();
    const policy = createPolicy({ warn });
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.create",
      input: z.object({ username: z.string() }),
      restInput: c => c.req.valid("json") as { username: string },
      handler,
    });
    const route = createRouter().openapi(
      userCreateInputRoute,
      operation.toHandler<RouteHandler<typeof userCreateInputRoute>>() as never,
    );
    const app = new Hono();
    app.use("/admin/*", async (c, next) => {
      c.set("tierBasePath" as never, "/admin" as never);
      c.set("adminAuthorizationPolicy" as never, policy as never);
      c.set("userId" as never, 7 as never);
      c.set("username" as never, "ordinary" as never);
      c.set("userDetailDto" as never, { roles: ["iam:user"] } as never);
      await next();
    });
    app.use(
      "/admin/*",
      createAdminRestAuthorizationHandler(createProductionRestOperationSurface()),
    );
    app.route("/admin", route);
    app.onError((error, c) => c.text(
      error.message,
      ("httpStatus" in error ? error.httpStatus : 500) as never,
    ));

    const response = await app.request("http://localhost/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createDeeplyNestedJson(20_000),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("无管理端操作权限");
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.create",
      resourceIdentifier: "collection",
      resourceType: "user",
    }), "admin mutation authorization denied");
  });

  test("bounds wide raw REST and tRPC input before writing denial logs", async () => {
    const handler = mock(async () => true);
    const warn = mock();
    const policy = createPolicy({ warn });
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.create",
      input: z.object({ username: z.string() }),
      restInput: c => c.req.valid("json") as { username: string },
      handler,
    });
    const route = createRouter().openapi(
      userCreateInputRoute,
      operation.toHandler<RouteHandler<typeof userCreateInputRoute>>() as never,
    );
    const app = new Hono();
    app.use("/admin/*", async (c, next) => {
      c.set("tierBasePath" as never, "/admin" as never);
      c.set("adminAuthorizationPolicy" as never, policy as never);
      c.set("userId" as never, 7 as never);
      c.set("username" as never, "ordinary" as never);
      c.set("userDetailDto" as never, { roles: ["iam:user"] } as never);
      await next();
    });
    app.use(
      "/admin/*",
      createAdminRestAuthorizationHandler(createProductionRestOperationSurface()),
    );
    app.route("/admin", route);
    app.onError((error, c) => c.text(
      error.message,
      ("httpStatus" in error ? error.httpStatus : 500) as never,
    ));

    const response = await app.request("http://localhost/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createWideJson(10_000),
    });

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.create",
      resourceIdentifier: "collection",
      resourceType: "user",
    }), "admin mutation authorization denied");

    const trpcContext = {
      get: mock((key: string) => {
        if (key === "adminAuthorizationPolicy")
          return policy;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "ordinary";
        if (key === "userDetailDto")
          return { roles: ["iam:user"] };
        return undefined;
      }),
    } as unknown as Context;
    const caller = router({ create: operation.toTRPC() }).createCaller({
      hono: trpcContext,
    });
    let trpcFailure: unknown;
    try {
      await caller.create(JSON.parse(createWideJson(10_000)) as never);
    }
    catch (error) {
      trpcFailure = error;
    }

    expect(trpcFailure).toMatchObject({ code: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [fields] of warn.mock.calls) {
      expect(fields).toMatchObject({
        action: "admin.user.create",
        resourceIdentifier: "collection",
        resourceType: "user",
      });
    }
  });

  test("REST handler builds input, passes Hono context, and returns success envelope", async () => {
    const handler = mock(async (input: { id: string; enabled: boolean }, context?: { hono?: Context }) => ({
      contextPassed: Boolean(context?.hono),
      id: input.id,
      enabled: input.enabled,
    }));
    const operation = defineAdminApiOperation({
      type: "query",
      operationId: "admin.user.search",
      input: z.object({
        enabled: z.boolean(),
        id: z.string(),
      }),
      restInput: c => ({
        ...c.req.valid("param") as { id: string },
        ...c.req.valid("json") as { enabled: boolean },
      }),
      handler,
    });
    const context = createRestContext({
      json: { enabled: true },
      param: { id: "u-1" },
    });

    const result: unknown = await operation.toHandler()(context);

    expect(context.req.valid).toHaveBeenCalledWith("param");
    expect(context.req.valid).toHaveBeenCalledWith("json");
    expect(handler).toHaveBeenCalledWith({ id: "u-1", enabled: true }, { hono: context });
    expect(context.json).toHaveBeenCalledWith({
      code: 200,
      data: { id: "u-1", enabled: true, contextPassed: true },
      message: "success",
    }, 200);
    expect(result).toEqual({
      code: 200,
      data: { id: "u-1", enabled: true, contextPassed: true },
      message: "success",
    });
  });

  test("tRPC procedure uses declared input and passes caller context", async () => {
    const hono = createRestContext({}) as unknown as Context;
    const handler = mock(async (input: { id: string }, context?: { hono?: Context }) => ({
      contextPassed: context?.hono === hono,
      id: input.id,
    }));
    const operation = defineAdminApiOperation({
      type: "mutation",
      operationId: "admin.user.delete",
      input: z.object({ id: z.string() }),
      restInput: c => c.req.valid("param") as { id: string },
      handler,
    });
    const caller = router({ update: operation.toTRPC() }).createCaller({ hono });

    await expect(caller.update({ id: "u-2" })).resolves.toEqual({
      contextPassed: true,
      id: "u-2",
    });
    expect(handler).toHaveBeenCalledWith({ id: "u-2" }, { hono });
  });

  test("tRPC procedure maps CustomError to TRPCError", async () => {
    const operation = defineAdminApiOperation({
      type: "query",
      operationId: "admin.user.detail",
      input: z.object({ id: z.string() }),
      restInput: c => c.req.valid("param") as { id: string },
      handler: async () => {
        throw new CustomError("missing", { httpStatus: NOT_FOUND });
      },
    });
    const caller = router({ detail: operation.toTRPC() }).createCaller({
      hono: createRestContext({}) as unknown as Context,
    });

    try {
      await caller.detail({ id: "missing" });
      throw new Error("expected tRPC call to fail");
    }
    catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
      expect((err as TRPCError).message).toBe("missing");
    }
  });
});
