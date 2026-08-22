import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { ApiErrorCode } from "@iam/contracts";

export class InternalUserProfileSearchUnavailableError extends Error {
  readonly code = ApiErrorCode.UserSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;

  constructor() {
    super("用户搜索暂时不可用");
    this.name = new.target.name;
  }
}

export class InternalUserProfileDetailIntegrityError extends Error {
  constructor() {
    super("已发布的 User Profile Detail 不符合严格契约");
    this.name = new.target.name;
  }
}
