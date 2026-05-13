import type { Context as HonoContext } from "hono";
import { initTRPC, TRPCError } from "@trpc/server";
import { CustomError } from "../errors/CustomError";

export interface TRPCAppContext {
  hono: HonoContext;
}

export async function createTRPCContext(opts: { honoCtx: HonoContext }): Promise<TRPCAppContext> {
  return { hono: opts.honoCtx };
}

const t = initTRPC.context<TRPCAppContext>().create({
  errorFormatter({ shape, error }) {
    if (error.cause instanceof CustomError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          serviceCode: error.cause.code,
          serviceMessage: error.cause.message,
        },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export function mapCustomErrorToTRPCError(err: unknown): never {
  if (err instanceof CustomError) {
    const httpCode = err.code === 404
      ? "NOT_FOUND"
      : err.code === 409
        ? "CONFLICT"
        : err.code === 403
          ? "FORBIDDEN"
          : err.code === 401
            ? "UNAUTHORIZED"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({
      code: httpCode,
      message: err.message,
      cause: err,
    });
  }
  throw err;
}
