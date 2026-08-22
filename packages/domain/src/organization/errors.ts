import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class OrganizationNotFoundError extends DomainBusinessError {
  constructor(message: string = "组织不存在") {
    super(message, {
      code: ApiErrorCode.OrganizationNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class OrganizationAlreadyExistsError extends DomainBusinessError {
  constructor(message: string = "待创建组织已存在") {
    super(message, {
      code: ApiErrorCode.OrganizationAlreadyExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationCodeExistsError extends DomainBusinessError {
  constructor(message: string = "组织编码已存在") {
    super(message, {
      code: ApiErrorCode.OrganizationCodeExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationHasChildrenError extends DomainBusinessError {
  constructor(message: string = "该组织下存在子组织，无法删除") {
    super(message, {
      code: ApiErrorCode.OrganizationHasChildren,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationHasEmploymentError extends DomainBusinessError {
  constructor(message: string = "该组织层级内存在开放任职，无法停用或删除") {
    super(message, {
      code: ApiErrorCode.OrganizationHasEmployment,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class OrganizationHasOpenResponsibilityAssignmentError extends DomainBusinessError {
  constructor(
    message: string = "该组织层级内存在开放责任任命，无法暂停、停用或删除",
  ) {
    super(message, {
      code: ApiErrorCode.OrganizationHasOpenResponsibilityAssignment,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}
