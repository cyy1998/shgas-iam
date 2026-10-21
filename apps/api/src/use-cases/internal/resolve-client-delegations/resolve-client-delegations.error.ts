import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { ApiErrorCode } from "@iam/contracts";
import type {
  ClientDelegationResolutionIntegrityViolation,
  ClientDelegationResolutionMissingInputs,
} from "./resolve-client-delegations.type";

export const CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE = "委托解析输入无法识别";
export const CLIENT_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE = "委托解析暂时不可用";

export type ClientDelegationResolutionFailureDiagnostic =
  | {
      failureCategory: "integrity-violation";
      violations: ClientDelegationResolutionIntegrityViolation[];
    }
  | {
      failureCategory: "persistence-failure" | "statement-timeout" | "handler-timeout";
      context: {
        orgCode: string;
        clientId: number;
        usernameCount: number;
      };
    };

export class ClientDelegationResolutionUnavailableError extends CustomError {
  constructor(
    readonly diagnostic: ClientDelegationResolutionFailureDiagnostic,
    cause?: unknown,
  ) {
    super(CLIENT_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE, {
      code: ApiErrorCode.ClientDelegationResolutionUnavailable,
      httpStatus: SERVICE_UNAVAILABLE,
    });
    this.name = new.target.name;
    if (cause !== undefined) this.cause = cause;
  }
}

export class ClientDelegationResolutionInputNotFoundError extends Error {
  readonly code = ApiErrorCode.ClientDelegationResolutionInputNotFound;

  constructor(readonly missingInputs: ClientDelegationResolutionMissingInputs) {
    super(CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE);
    this.name = new.target.name;
  }
}
