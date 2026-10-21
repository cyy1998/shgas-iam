import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class ClientDelegationNotFoundError extends DomainBusinessError {
  constructor(message: string = "委托记录不存在") {
    super(message, {
      code: ApiErrorCode.ClientDelegationNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class ClientDelegationEndedError extends DomainBusinessError {
  constructor(message: string = "该委托已结束，不允许再修改") {
    super(message, {
      code: ApiErrorCode.ClientDelegationEnded,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class ClientDelegationConflictError extends DomainBusinessError {
  constructor(message: string = "同一应用在相交的组织范围和期间内已有委托") {
    super(message, {
      code: ApiErrorCode.ClientDelegationConflict,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
