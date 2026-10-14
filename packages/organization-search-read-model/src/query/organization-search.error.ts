import { SERVICE_UNAVAILABLE, UNPROCESSABLE_ENTITY } from "@iam/api-core/core/http-status-codes";
import { ApiErrorCode } from "@iam/contracts";

export class OrganizationSearchFilterValidationError extends Error {
  readonly code = ApiErrorCode.ValidationFailed;
  readonly httpStatus = UNPROCESSABLE_ENTITY;
  constructor() {
    super("Organization Filter 不符合严格契约或资源预算");
    this.name = new.target.name;
  }
}

export class OrganizationSearchResultTooLargeError extends Error {
  readonly code = ApiErrorCode.OrganizationSearchResultTooLarge;
  readonly httpStatus = UNPROCESSABLE_ENTITY;
  constructor() {
    super("组织搜索结果超过固定上限");
    this.name = new.target.name;
  }
}

export class OrganizationSearchUnavailableError extends Error {
  readonly code = ApiErrorCode.OrganizationSearchUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;
  constructor() {
    super("组织搜索暂时不可用");
    this.name = new.target.name;
  }
}
