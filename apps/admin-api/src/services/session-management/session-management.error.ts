import {
  CONFLICT,
  INTERNAL_SERVER_ERROR,
  SERVICE_UNAVAILABLE,
} from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { ApiErrorCode } from "@iam/contracts";

export class AdminLoginStateUnavailableError extends CustomError {
  constructor(cause?: unknown) {
    super("登录状态服务暂时不可用", {
      code: ApiErrorCode.AdminLoginStateUnavailable,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = "AdminLoginStateUnavailableError";
    this.cause = cause;
  }
}

export class AdminSessionCurrentProtectedError extends CustomError {
  constructor() {
    super("当前管理会话不能被强制下线", {
      code: ApiErrorCode.AdminSessionCurrentProtected,
      httpStatus: CONFLICT,
    });
    this.name = "AdminSessionCurrentProtectedError";
  }
}

export class AdminLoginStateAuditFailedError extends CustomError {
  constructor(cause?: unknown) {
    super("服务器内部错误", {
      code: ApiErrorCode.InternalError,
      httpStatus: INTERNAL_SERVER_ERROR,
    });
    this.name = "AdminLoginStateAuditFailedError";
    this.cause = cause;
  }
}

export class AdminLoginStateAuditFailedAfterEffectError extends CustomError {
  constructor(cause?: unknown) {
    super("登录状态已变更，但审计记录失败；请刷新确认且不要自动重试", {
      code: ApiErrorCode.AdminLoginStateAuditFailedAfterEffect,
      httpStatus: INTERNAL_SERVER_ERROR,
    });
    this.name = "AdminLoginStateAuditFailedAfterEffectError";
    this.cause = cause;
  }
}
