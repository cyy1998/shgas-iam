import { ApiErrorCode } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "@iam/contracts/http";

export class InternalUserDocumentSearchUnavailableError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("用户搜索暂时不可用");
    this.name = new.target.name;
  }
}

export class InternalUserDocumentDetailIntegrityError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("已发布的 User Document Detail 不符合严格契约");
    this.name = new.target.name;
  }
}
