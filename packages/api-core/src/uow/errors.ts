import type { ApiRuntimeError } from "../errors/api-runtime-error";
import type { AfterCommitTaskFailure } from "./after-commit";
import { ApiErrorCode } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "../core/http-status-codes";

export class AfterCommitRequiredTaskError extends Error implements ApiRuntimeError {
  public code = ApiErrorCode.InternalError;
  public httpStatus = INTERNAL_SERVER_ERROR;
  public readonly failures: readonly AfterCommitTaskFailure[];

  constructor(failures: readonly AfterCommitTaskFailure[]) {
    super("服务器内部错误");
    this.name = "AfterCommitRequiredTaskError";
    this.failures = failures;
  }
}
