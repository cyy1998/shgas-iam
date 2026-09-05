import type { Context } from "hono";
import { ApiErrorCode } from "@iam/contracts";
import { setCookie } from "hono/cookie";
import { SERVICE_UNAVAILABLE, UNAUTHORIZED } from "../../core/http-status-codes";
import { CustomError } from "../../errors";
import {
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "../errors";

export class SubjectAccessSessionInvalidHttpError extends CustomError {
  constructor() {
    super("会话已失效", {
      code: ApiErrorCode.SessionInvalid,
      httpStatus: UNAUTHORIZED,
    });
    this.name = "SubjectAccessSessionInvalidHttpError";
  }
}

export class SubjectAccessUnavailableHttpError extends CustomError {
  public readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super("账号访问状态暂时不可用", {
      code: ApiErrorCode.SubjectAccessUnavailable,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = "SubjectAccessUnavailableHttpError";
    if (
      retryAfterSeconds !== undefined
      && (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds <= 0)
    ) {
      throw new RangeError(
        "Subject Access retryAfterSeconds must be a positive safe integer",
      );
    }
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface SubjectAccessHttpRunOptions {
  readonly clearCookiesOnInvalidSession?: readonly string[];
  readonly retryAfterSeconds?: number;
}

export function createSubjectAccessHttpAdapter() {
  async function run<T>(
    context: Context,
    options: SubjectAccessHttpRunOptions,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    }
    catch (error) {
      if (
        error instanceof SubjectAccessSessionInvalidHttpError
        || error instanceof SubjectAccessDisabledError
      ) {
        for (const cookieName of new Set(options.clearCookiesOnInvalidSession ?? [])) {
          if (!isCookieName(cookieName))
            continue;
          setCookie(context, cookieName, "", {
            expires: new Date(0),
            maxAge: 0,
            path: "/",
          });
        }
        throw error instanceof SubjectAccessSessionInvalidHttpError
          ? error
          : new SubjectAccessSessionInvalidHttpError();
      }
      if (error instanceof SubjectAccessUnavailableError) {
        throw new SubjectAccessUnavailableHttpError(
          options.retryAfterSeconds,
        );
      }
      throw error;
    }
  }

  return { run };
}

function isCookieName(value: string) {
  return /^[!#$%&'*+\-.^\w`|~]+$/u.test(value);
}
