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

export class ClientInvalidRedirectUrlPatternError extends DomainBusinessError {
  constructor(message: string = "存在非法 redirect URL pattern") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class OidcClientConfigurationError extends DomainBusinessError {
  constructor(message: string = "OIDC 客户端配置无效") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class OidcClientStateError extends DomainBusinessError {
  constructor(message: string = "OIDC 客户端状态不允许该操作") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class CustomSsoClientConfigurationError extends DomainBusinessError {
  constructor(message: string = "Custom SSO 客户端配置无效") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class CustomSsoClientStateError extends DomainBusinessError {
  constructor(message: string = "Custom SSO 客户端状态不允许该操作") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}
