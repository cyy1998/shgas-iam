import type { Context as HonoContext } from "hono";
import { initTRPC, TRPCError } from "@trpc/server";
import {
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
  UNAUTHORIZED,
} from "../core/http-status-codes";
import { isApiRuntimeError } from "../errors/api-runtime-error";

export interface TRPCAppContext {
  hono: HonoContext;
}

export async function createTRPCContext(opts: { honoCtx: HonoContext }): Promise<TRPCAppContext> {
  return { hono: opts.honoCtx };
}

const t = initTRPC.context<TRPCAppContext>().create({
  errorFormatter({ shape, error }) {
    const apiRuntimeErrorData = getApiRuntimeErrorFormatterData(error.cause);
    if (apiRuntimeErrorData) {
      return {
        ...shape,
        data: {
          ...shape.data,
          ...apiRuntimeErrorData,
        },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

function mapHttpStatusToTRPCCode(status: number): TRPCError["code"] {
  if (status === NOT_FOUND)
    return "NOT_FOUND";
  if (status === CONFLICT)
    return "CONFLICT";
  if (status === FORBIDDEN)
    return "FORBIDDEN";
  if (status === UNAUTHORIZED)
    return "UNAUTHORIZED";
  return "INTERNAL_SERVER_ERROR";
}

export function getApiRuntimeErrorFormatterData(err: unknown) {
  if (!isApiRuntimeError(err))
    return null;

  return {
    serviceCode: err.code,
    serviceMessage: err.message,
    httpStatus: err.httpStatus,
  };
}

export function mapCustomErrorToTRPCError(err: unknown): never {
  if (isApiRuntimeError(err)) {
    throw new TRPCError({
      code: mapHttpStatusToTRPCCode(err.httpStatus),
      message: err.message,
      cause: err,
    });
  }
  throw err;
}
