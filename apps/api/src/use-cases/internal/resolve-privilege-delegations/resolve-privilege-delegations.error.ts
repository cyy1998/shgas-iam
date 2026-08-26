import type {
  PrivilegeDelegationResolutionIntegrityViolation,
  PrivilegeDelegationResolutionMissingInputs,
} from "./resolve-privilege-delegations.type";
import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { ApiErrorCode } from "@iam/contracts";

export const PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE
  = "权限委托解析输入无法识别";
export const PRIVILEGE_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE
  = "权限委托解析暂时不可用";

export type PrivilegeDelegationResolutionFailureDiagnostic
  = | {
    failureCategory: "integrity-violation";
    violations: PrivilegeDelegationResolutionIntegrityViolation[];
  }
  | {
    failureCategory: "persistence-failure" | "statement-timeout" | "handler-timeout";
    context: {
      orgCode: string;
      privilegeCode: string;
      usernameCount: number;
    };
  };

export class PrivilegeDelegationResolutionUnavailableError extends CustomError {
  constructor(
    readonly diagnostic: PrivilegeDelegationResolutionFailureDiagnostic,
    cause?: unknown,
  ) {
    super(PRIVILEGE_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE, {
      code: ApiErrorCode.PrivilegeDelegationResolutionUnavailable,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = new.target.name;
    if (cause !== undefined)
      this.cause = cause;
  }
}

export class PrivilegeDelegationResolutionInputNotFoundError extends Error {
  readonly code = ApiErrorCode.PrivilegeDelegationResolutionInputNotFound;

  constructor(
    readonly missingInputs: PrivilegeDelegationResolutionMissingInputs,
  ) {
    super(PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE);
    this.name = new.target.name;
  }
}
