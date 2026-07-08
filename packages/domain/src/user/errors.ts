import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class UserNotFoundError extends DomainBusinessError {
  constructor(message: string = "用户不存在") {
    super(message, {
      code: ApiErrorCode.UserNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class UsernameAlreadyExistsError extends DomainBusinessError {
  constructor(message: string = "用户名已存在") {
    super(message, {
      code: ApiErrorCode.UsernameAlreadyExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class InvalidMobileError extends DomainBusinessError {
  constructor(message: string = "无效手机号") {
    super(message, {
      code: ApiErrorCode.InvalidMobile,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class MobileAlreadyExistsError extends DomainBusinessError {
  constructor(message: string = "手机号已存在") {
    super(message, {
      code: ApiErrorCode.MobileAlreadyExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class InvalidOldPasswordError extends DomainBusinessError {
  constructor(message: string = "旧密码错误") {
    super(message, {
      code: ApiErrorCode.InvalidOldPassword,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class WeakPasswordError extends DomainBusinessError {
  constructor(message: string = "新密码强度过低") {
    super(message, {
      code: ApiErrorCode.WeakPassword,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class UserPasswordUnchangedError extends DomainBusinessError {
  constructor(message: string = "旧密码与新密码相同") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class UserHasActiveEmploymentError extends DomainBusinessError {
  constructor(message: string = "该用户仍存在活跃雇佣，无法删除") {
    super(message, {
      code: ApiErrorCode.UserHasActiveEmployment,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
