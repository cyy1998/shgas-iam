import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class PositionNotFoundError extends DomainBusinessError {
  constructor(message: string = "岗位不存在") {
    super(message, {
      code: ApiErrorCode.PositionNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class PositionCodeExistsError extends DomainBusinessError {
  constructor(message: string = "岗位编码已存在") {
    super(message, {
      code: ApiErrorCode.PositionCodeExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class PositionHasEmploymentError extends DomainBusinessError {
  constructor(message: string = "该岗位存在开放任职，无法停用或删除") {
    super(message, {
      code: ApiErrorCode.PositionHasEmployment,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
