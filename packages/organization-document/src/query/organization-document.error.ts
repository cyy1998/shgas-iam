import { ApiErrorCode } from "@iam/contracts";
import { NOT_FOUND, SERVICE_UNAVAILABLE, UNPROCESSABLE_ENTITY } from "@iam/contracts/http";

export class OrganizationDirectoryNotFoundError extends Error {
  readonly code = ApiErrorCode.OrganizationNotFound;
  readonly httpStatus = NOT_FOUND;
  constructor() {
    super("当前已发布目录中没有该组织");
    this.name = new.target.name;
  }
}

export class OrganizationDocumentFilterValidationError extends Error {
  readonly code = ApiErrorCode.ValidationFailed;
  readonly httpStatus = UNPROCESSABLE_ENTITY;
  constructor() {
    super("Organization Filter 不符合严格契约或资源预算");
    this.name = new.target.name;
  }
}

export class OrganizationDocumentResultTooLargeError extends Error {
  readonly code = ApiErrorCode.OrganizationDocumentResultTooLarge;
  readonly httpStatus = UNPROCESSABLE_ENTITY;
  constructor() {
    super("组织搜索结果超过固定上限");
    this.name = new.target.name;
  }
}

export class OrganizationDocumentUnavailableError extends Error {
  readonly code = ApiErrorCode.OrganizationDocumentUnavailable;
  readonly httpStatus = SERVICE_UNAVAILABLE;
  constructor() {
    super("组织搜索暂时不可用");
    this.name = new.target.name;
  }
}
