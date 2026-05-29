import type { z } from "zod";
import * as resp from "../http";
import { mapCustomErrorToTRPCError, publicProcedure } from "../trpc";

type Handler<TSchema extends z.ZodTypeAny, TOutput> = (
  input: z.infer<TSchema>,
  context?: unknown,
) => Promise<TOutput>;

function buildResolver<TSchema extends z.ZodTypeAny, TOutput>(
  handler: Handler<TSchema, TOutput>,
) {
  return async (opts: { input: unknown; ctx?: unknown }) => {
    try {
      return await handler(opts.input as z.infer<TSchema>, opts.ctx);
    }
    catch (err) {
      mapCustomErrorToTRPCError(err);
    }
  };
}

function buildRun<TSchema extends z.ZodTypeAny, TOutput>(
  handler: Handler<TSchema, TOutput>,
) {
  return async (input: z.infer<TSchema>, context?: unknown) => {
    const data = await handler(input, context);
    return resp.ok(data);
  };
}

export function defineQueryOp<TSchema extends z.ZodTypeAny, TOutput>(
  op: { input: TSchema; handler: Handler<TSchema, TOutput> },
) {
  return {
    input: op.input,
    handler: op.handler,
    toTRPC: () => publicProcedure.input(op.input).query(buildResolver(op.handler)),
    run: buildRun(op.handler),
  };
}

export function defineMutationOp<TSchema extends z.ZodTypeAny, TOutput>(
  op: { input: TSchema; handler: Handler<TSchema, TOutput> },
) {
  return {
    input: op.input,
    handler: op.handler,
    toTRPC: () => publicProcedure.input(op.input).mutation(buildResolver(op.handler)),
    run: buildRun(op.handler),
  };
}
