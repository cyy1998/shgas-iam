import type { z } from "zod";
import { mapCustomErrorToTRPCError, publicProcedure } from "@api/trpc/trpc";
import * as resp from "@api/utils/http/response";

type Handler<TSchema extends z.ZodTypeAny, TOutput> = (
  input: z.infer<TSchema>,
) => Promise<TOutput>;

function buildResolver<TSchema extends z.ZodTypeAny, TOutput>(
  handler: Handler<TSchema, TOutput>,
) {
  return async (opts: { input: unknown }) => {
    try {
      return await handler(opts.input as z.infer<TSchema>);
    }
    catch (err) {
      mapCustomErrorToTRPCError(err);
    }
  };
}

function buildRun<TSchema extends z.ZodTypeAny, TOutput>(
  handler: Handler<TSchema, TOutput>,
) {
  return async (input: z.infer<TSchema>) => {
    const data = await handler(input);
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
