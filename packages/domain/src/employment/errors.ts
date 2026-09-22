import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class EmploymentNotFoundError extends DomainBusinessError {
  constructor(message: string = "雇佣关系不存在") {
    super(message, {
      code: ApiErrorCode.EmploymentNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class EmploymentNotEditableError extends DomainBusinessError {
  constructor(message: string = "已结束的雇佣关系不能修改") {
    super(message, {
      code: ApiErrorCode.EmploymentNotEditable,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class EmploymentAlreadyExistsError extends DomainBusinessError {
  constructor(message: string = "相同任职关系已存在") {
    super(message, {
      code: ApiErrorCode.EmploymentAlreadyExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class EmploymentOrganizationScopeMismatchError extends DomainBusinessError {
  constructor(message: string = "任职组织不属于期望组织范围") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class EmploymentUserDisabledError extends DomainBusinessError {
  constructor() {
    super("用户已停用，不能新增任职或转岗", {
      code: ApiErrorCode.EmploymentUserDisabled,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
