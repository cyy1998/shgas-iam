import type { ApiEnvelope } from "@iam/api-core/http";
import type { Context, Env, TypedResponse } from "hono";
import type { JSONParsed } from "hono/utils/types";
import type { z } from "zod";
import * as resp from "@iam/api-core/http";
import { mapCustomErrorToTRPCError, publicProcedure } from "@iam/api-core/trpc";

export type AdminApiOperationType = "query" | "mutation";

export type AdminApiOperationContext = {
  hono?: Context;
};

export type AdminApiRestContext = Context<Env, string, {
  out: {
    json: unknown;
    param: Record<string, unknown>;
    query: Record<string, unknown>;
  };
}>;

type MaybePromise<T> = T | Promise<T>;

type HandlerReturn<THandler> = THandler extends (...args: infer _Args) => infer TReturn ? TReturn : never;

type AdminApiGeneratedRestResponse<TOutput>
  = Response & TypedResponse<JSONParsed<ApiEnvelope<Awaited<TOutput>, 200>>, 200, "json">;

type AdminApiGeneratedRestHandler<TOutput> = (c: AdminApiRestContext) => Promise<
  AdminApiGeneratedRestResponse<TOutput>
>;

type AdminApiRestHandlerCompatibility<THandler, TOutput>
  = AdminApiGeneratedRestResponse<TOutput> extends Awaited<HandlerReturn<THandler>>
    ? []
    : ["Admin REST handler response is not assignable to route response schema"];

type AdminApiOperationHandler<TSchema extends z.ZodTypeAny, TOutput> = (
  input: z.infer<TSchema>,
  context?: AdminApiOperationContext,
) => MaybePromise<TOutput>;

export interface AdminApiOperationConfig<TSchema extends z.ZodTypeAny, TOutput> {
  type: AdminApiOperationType;
  input: TSchema;
  restInput: (c: AdminApiRestContext) => z.infer<TSchema>;
  handler: AdminApiOperationHandler<TSchema, TOutput>;
}

type AdminApiOperationDefinition<TSchema extends z.ZodTypeAny, TOutput> = Omit<
  AdminApiOperationConfig<TSchema, TOutput>,
  "type"
>;

/**
 * Use this for admin REST/tRPC operations where the adapter only assembles input,
 * forwards Hono context, and wraps protocol responses. Keep complex orchestration in service code.
 */
function createAdminApiOperationBase<TSchema extends z.ZodTypeAny, TOutput>(
  config: AdminApiOperationDefinition<TSchema, TOutput>,
) {
  async function run(input: z.infer<TSchema>, context?: AdminApiOperationContext) {
    return config.handler(config.input.parse(input), context);
  }

  function toHandler<THandler = AdminApiGeneratedRestHandler<TOutput>>(
    ..._compatibility: AdminApiRestHandlerCompatibility<THandler, TOutput>
  ): THandler {
    const handler = async (c: AdminApiRestContext) => {
      const data = await run(config.restInput(c), { hono: c });
      return c.json(resp.ok(data), 200);
    };
    return handler as unknown as THandler;
  }

  const resolver = async (opts: { input: unknown; ctx?: AdminApiOperationContext }) => {
    try {
      return await run(opts.input as z.infer<TSchema>, opts.ctx);
    }
    catch (err) {
      mapCustomErrorToTRPCError(err);
    }
  };

  return {
    handler: config.handler,
    input: config.input,
    resolver,
    restInput: config.restInput,
    run,
    toHandler,
  };
}

export function defineAdminApiQueryOperation<TSchema extends z.ZodTypeAny, TOutput>(
  config: AdminApiOperationDefinition<TSchema, TOutput>,
) {
  const operation = createAdminApiOperationBase(config);
  return {
    ...operation,
    toTRPC: () => publicProcedure.input(config.input).query(operation.resolver),
    type: "query" as const,
  };
}

export function defineAdminApiMutationOperation<TSchema extends z.ZodTypeAny, TOutput>(
  config: AdminApiOperationDefinition<TSchema, TOutput>,
) {
  const operation = createAdminApiOperationBase(config);
  return {
    ...operation,
    toTRPC: () => publicProcedure.input(config.input).mutation(operation.resolver),
    type: "mutation" as const,
  };
}

export function defineAdminApiOperation<TSchema extends z.ZodTypeAny, TOutput>(
  config: AdminApiOperationConfig<TSchema, TOutput>,
) {
  if (config.type === "query") {
    return defineAdminApiQueryOperation(config);
  }
  return defineAdminApiMutationOperation(config);
}
