import type { RouteHandler } from "@hono/zod-openapi";
import type { ApiEnvelope } from "@iam/api-core/http";
import type { Context } from "hono";
import type { AdminApiRestContext } from "../admin-api-adapter";
import { createRoute } from "@hono/zod-openapi";
import { NOT_FOUND, OK } from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { CustomError } from "@iam/api-core/errors";
import { router } from "@iam/api-core/trpc";
import { TRPCError } from "@trpc/server";
import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { defineAdminApiOperation } from "../admin-api-adapter";

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

type ObjectOutputRouteHandler = RouteHandler<typeof typedObjectOutputRoute>;
type StringOutputRouteHandler = RouteHandler<typeof typedStringOutputRoute>;

const typedObjectOutputOperation = defineAdminApiOperation({
  type: "query",
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

function createRestContext(valid: Record<string, unknown>) {
  return {
    req: {
      valid: mock((target: string) => valid[target]),
    },
    json: mock((body: unknown) => body),
  } as unknown as AdminApiRestContext & {
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("defineAdminApiOperation", () => {
  test("REST handler builds input, passes Hono context, and returns success envelope", async () => {
    const handler = mock(async (input: { id: string; enabled: boolean }, context?: { hono?: Context }) => ({
      contextPassed: Boolean(context?.hono),
      id: input.id,
      enabled: input.enabled,
    }));
    const operation = defineAdminApiOperation({
      type: "query",
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
    const hono = {} as Context;
    const handler = mock(async (input: { id: string }, context?: { hono?: Context }) => ({
      contextPassed: context?.hono === hono,
      id: input.id,
    }));
    const operation = defineAdminApiOperation({
      type: "mutation",
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
      input: z.object({ id: z.string() }),
      restInput: c => c.req.valid("param") as { id: string },
      handler: async () => {
        throw new CustomError("missing", { httpStatus: NOT_FOUND });
      },
    });
    const caller = router({ detail: operation.toTRPC() }).createCaller({ hono: {} as Context });

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
