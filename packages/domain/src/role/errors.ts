import { ApiErrorCode } from "@iam/contracts";
import { DomainBusinessError, DomainHttpStatus } from "../errors";

export class RoleNotFoundError extends DomainBusinessError {
  constructor(message: string = "角色不存在") {
    super(message, {
      code: ApiErrorCode.RoleNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}

export class RoleCodeExistsError extends DomainBusinessError {
  constructor(message: string = "角色编码已存在") {
    super(message, {
      code: ApiErrorCode.RoleCodeExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class RoleHasAssignmentError extends DomainBusinessError {
  constructor(message: string = "角色仍存在分配，无法删除") {
    super(message, {
      code: ApiErrorCode.RoleHasAssignment,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class RoleAssignmentExistsError extends DomainBusinessError {
  constructor(message: string = "角色分配已存在") {
    super(message, {
      code: ApiErrorCode.RoleAssignmentExists,
      httpStatus: DomainHttpStatus.Conflict,
    });
  }
}

export class InvalidRoleAssignmentScopeError extends DomainBusinessError {
  constructor(message: string = "角色分配作用范围非法") {
    super(message, {
      code: ApiErrorCode.InvalidRoleAssignmentScope,
      httpStatus: DomainHttpStatus.BadRequest,
    });
  }
}

export class RoleAssignmentTargetNotFoundError extends DomainBusinessError {
  constructor(message: string = "角色分配目标不存在或不可用") {
    super(message, {
      code: ApiErrorCode.RoleAssignmentTargetNotFound,
      httpStatus: DomainHttpStatus.NotFound,
    });
  }
}
