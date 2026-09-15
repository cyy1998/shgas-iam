import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class ClientNotFoundError extends DomainBusinessError {
  constructor(message: string = "客户端不存在") {
    super(message, {
      code: ApiErrorCode.ClientNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class ClientCodeExistsError extends DomainBusinessError {
  constructor(message: string = "客户端编码已存在") {
    super(message, {
      code: ApiErrorCode.ClientCodeExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class ClientCodeImmutableError extends DomainBusinessError {
  constructor(message: string = "客户端编码创建后不可修改") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}
