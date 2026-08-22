import {
  SERVICE_UNAVAILABLE,
  UNPROCESSABLE_ENTITY,
} from "@iam/api-core/core/http-status-codes";
import { ApiErrorCode } from "@iam/contracts";

export class V3UserProfileFilterValidationError extends Error {
  readonly code = ApiErrorCode.ValidationFailed;
  readonly httpStatus = UNPROCESSABLE_ENTITY;

  constructor() {
    super("User Profile Filter 不符合严格契约或资源预算");
    this.name = new.target.name;
  }
}

export class V3UserProfileSearchResultTooLargeError extends Error {
  readonly code = ApiErrorCode.UserSearchResultTooLarge;
  readonly httpStatus = UNPROCESSABLE_ENTITY;

  constructor() {
    super("用户搜索结果超过固定上限");
    this.name = new.target.name;
  }
}

export class V3UserProfileSearchUnavailableError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("用户搜索暂时不可用");
    this.name = new.target.name;
  }
}

export class V3UserProfileDocumentIntegrityError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("已发布的 User Profile v3 文档不符合严格契约");
    this.name = new.target.name;
  }
}
