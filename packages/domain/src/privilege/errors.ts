import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class PrivilegeDelegationNotFoundError extends DomainBusinessError {
  constructor(message: string = "委托记录不存在") {
    super(message, {
      code: ApiErrorCode.PrivilegeDelegationNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class PrivilegeDelegationEndedError extends DomainBusinessError {
  constructor(message: string = "该委托已结束，不允许再修改") {
    super(message, {
      code: ApiErrorCode.PrivilegeDelegationEnded,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class PrivilegeNotFoundError extends DomainBusinessError {
  constructor(message: string = "权限不存在") {
    super(message, {
      code: ApiErrorCode.PrivilegeNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class PrivilegeAlreadyDelegatedError extends DomainBusinessError {
  constructor(message: string = "以下权限已被授权") {
    super(message, {
      code: ApiErrorCode.PrivilegeAlreadyDelegated,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
