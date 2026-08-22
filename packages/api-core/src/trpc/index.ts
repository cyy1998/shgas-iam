import type { Context as HonoContext } from "hono";
import { ApiErrorCode } from "@iam/contracts";
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
  UNAUTHORIZED,
} from "../core/http-status-codes";
import { getRequestId } from "../core/request-context";
import { isApiRuntimeError } from "../errors/api-runtime-error";
import { getInternalErrorMessage } from "../errors/internal-error-presentation";

export interface TRPCAppContext {
  hono: HonoContext;
}

export async function createTRPCContext(opts: { honoCtx: HonoContext }): Promise<TRPCAppContext> {
  return { hono: opts.honoCtx };
}

const t = initTRPC.context<TRPCAppContext>().create({
  errorFormatter({ shape, error, ctx }) {
    const requestId = ctx ? getRequestId(ctx.hono) : undefined;
    const apiRuntimeErrorData = getApiRuntimeErrorFormatterData(error.cause);
    if (apiRuntimeErrorData) {
      if (apiRuntimeErrorData.serviceCode === ApiErrorCode.InternalError) {
        return createSafeErrorShape({
          shape,
          serviceCode: ApiErrorCode.InternalError,
          serviceMessage: getInternalErrorMessage(requestId),
          requestId,
        });
      }
      return {
        ...shape,
        data: {
          ...shape.data,
          ...apiRuntimeErrorData,
        },
      };
    }
    if (error.code === "BAD_REQUEST" && error.cause instanceof ZodError) {
      return createSafeErrorShape({
        shape,
        serviceCode: ApiErrorCode.ValidationFailed,
        serviceMessage: "请求参数不合法",
        requestId,
      });
    }
    if (error.code === "INTERNAL_SERVER_ERROR") {
      return createSafeErrorShape({
        shape,
        serviceCode: ApiErrorCode.InternalError,
        serviceMessage: getInternalErrorMessage(requestId),
        requestId,
      });
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

function createSafeErrorShape(input: {
  shape: {
    code: number;
    message: string;
    data: {
      code: string;
      httpStatus: number;
      path?: string;
    };
  };
  serviceCode: ApiErrorCode;
  serviceMessage: string;
  requestId: string | undefined;
}) {
  return {
    ...input.shape,
    message: input.serviceMessage,
    data: {
      code: input.shape.data.code,
      httpStatus: input.shape.data.httpStatus,
      path: input.shape.data.path,
      serviceCode: input.serviceCode,
      serviceMessage: input.serviceMessage,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
  };
}

function mapHttpStatusToTRPCCode(status: number): TRPCError["code"] {
  if (status === BAD_REQUEST)
    return "BAD_REQUEST";
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
