import { ApiErrorCode } from "@iam/contracts";
import { SERVICE_UNAVAILABLE, UNPROCESSABLE_ENTITY } from "@iam/contracts/http";

export class UserDocumentFilterValidationError extends Error {
  readonly code = ApiErrorCode.ValidationFailed;
  readonly httpStatus = UNPROCESSABLE_ENTITY;

  constructor() {
    super("User Document Filter 不符合严格契约或资源预算");
    this.name = new.target.name;
  }
}

export class UserDocumentSearchResultTooLargeError extends Error {
  readonly code = ApiErrorCode.UserSearchResultTooLarge;
  readonly httpStatus = UNPROCESSABLE_ENTITY;

  constructor() {
    super("用户搜索结果超过固定上限");
    this.name = new.target.name;
  }
}

export class UserDocumentSearchUnavailableError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("用户搜索暂时不可用");
    this.name = new.target.name;
  }
}

export class UserDocumentDocumentIntegrityError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("已发布的 User Document v4 文档不符合严格契约");
    this.name = new.target.name;
  }
}
