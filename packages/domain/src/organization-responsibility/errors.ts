import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class OrganizationResponsibilityAssignmentNotFoundError extends DomainBusinessError {
  constructor(message: string = "组织责任任命不存在") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityAssignmentNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class OrganizationResponsibilityAssignmentNotOpenError extends DomainBusinessError {
  constructor(message: string = "组织责任任命已结束") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityAssignmentNotOpen,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationResponsibilityHolderEmploymentUnavailableError extends DomainBusinessError {
  constructor(message: string = "责任持有任职未启用或不存在") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityHolderEmploymentUnavailable,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationResponsibilityTargetOrganizationUnavailableError extends DomainBusinessError {
  constructor(message: string = "责任目标组织未启用或不存在") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityTargetOrganizationUnavailable,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationResponsibilityAssignmentDuplicateOpenError extends DomainBusinessError {
  constructor(message: string = "同一任职已持有该 Open 组织责任") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityAssignmentDuplicateOpen,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationResponsibilityAssignmentCardinalityConflictError extends DomainBusinessError {
  constructor(message: string = "目标组织的 Open 责任已达到基数上限") {
    super(message, {
      code: ApiErrorCode.OrganizationResponsibilityAssignmentCardinalityConflict,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
