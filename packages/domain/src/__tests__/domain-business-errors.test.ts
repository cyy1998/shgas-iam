import { ApiErrorCode } from "@iam/contracts";
import * as Domain from "@iam/domain";
import * as ClientErrors from "@iam/domain/client";
import * as EmploymentErrors from "@iam/domain/employment";
import * as OrganizationErrors from "@iam/domain/organization";
import * as OrganizationResponsibilityErrors from "@iam/domain/organization-responsibility";
import * as PositionErrors from "@iam/domain/position";
import * as PrivilegeErrors from "@iam/domain/privilege";
import * as RoleErrors from "@iam/domain/role";
import * as UserErrors from "@iam/domain/user";
import { describe, expect, test } from "bun:test";
import { DomainBusinessError } from "../errors";

interface ExpectedError {
  className: string;
  exports: object;
  message: string;
  code: ApiErrorCode;
  httpStatus: number;
}

const cases: ExpectedError[] = [
  {
    className: "OrganizationResponsibilityAssignmentNotFoundError",
    exports: OrganizationResponsibilityErrors,
    message: "组织责任任命不存在",
    code: ApiErrorCode.OrganizationResponsibilityAssignmentNotFound,
    httpStatus: 404,
  },
  {
    className: "OrganizationResponsibilityAssignmentNotOpenError",
    exports: OrganizationResponsibilityErrors,
    message: "组织责任任命已结束",
    code: ApiErrorCode.OrganizationResponsibilityAssignmentNotOpen,
    httpStatus: 409,
  },
  {
    className: "OrganizationResponsibilityHolderEmploymentUnavailableError",
    exports: OrganizationResponsibilityErrors,
    message: "责任持有任职未启用或不存在",
    code: ApiErrorCode.OrganizationResponsibilityHolderEmploymentUnavailable,
    httpStatus: 409,
  },
  {
    className: "OrganizationResponsibilityTargetOrganizationUnavailableError",
    exports: OrganizationResponsibilityErrors,
    message: "责任目标组织未启用或不存在",
    code: ApiErrorCode.OrganizationResponsibilityTargetOrganizationUnavailable,
    httpStatus: 409,
  },
  {
    className: "OrganizationResponsibilityAssignmentDuplicateOpenError",
    exports: OrganizationResponsibilityErrors,
    message: "同一任职已持有该 Open 组织责任",
    code: ApiErrorCode.OrganizationResponsibilityAssignmentDuplicateOpen,
    httpStatus: 409,
  },
  {
    className: "OrganizationResponsibilityAssignmentCardinalityConflictError",
    exports: OrganizationResponsibilityErrors,
    message: "目标组织的 Open 责任已达到基数上限",
    code: ApiErrorCode.OrganizationResponsibilityAssignmentCardinalityConflict,
    httpStatus: 409,
  },
  {
    className: "OrganizationResponsibilityAssignmentUnmanageableConflictError",
    exports: OrganizationResponsibilityErrors,
    message: "责任槽位已占用；如果当前列表没有可管理记录，请联系完整管理员",
    code: ApiErrorCode.OrganizationResponsibilityAssignmentUnmanageableConflict,
    httpStatus: 409,
  },
  {
    className: "UserNotFoundError",
    exports: UserErrors,
    message: "用户不存在",
    code: ApiErrorCode.UserNotFound,
    httpStatus: 404,
  },
  {
    className: "UsernameAlreadyExistsError",
    exports: UserErrors,
    message: "用户名已存在",
    code: ApiErrorCode.UsernameAlreadyExists,
    httpStatus: 409,
  },
  {
    className: "InvalidMobileError",
    exports: UserErrors,
    message: "无效手机号",
    code: ApiErrorCode.InvalidMobile,
    httpStatus: 400,
  },
  {
    className: "MobileAlreadyExistsError",
    exports: UserErrors,
    message: "手机号已存在",
    code: ApiErrorCode.MobileAlreadyExists,
    httpStatus: 409,
  },
  {
    className: "InvalidOldPasswordError",
    exports: UserErrors,
    message: "旧密码错误",
    code: ApiErrorCode.InvalidOldPassword,
    httpStatus: 400,
  },
  {
    className: "WeakPasswordError",
    exports: UserErrors,
    message: "新密码强度过低",
    code: ApiErrorCode.WeakPassword,
    httpStatus: 400,
  },
  {
    className: "UserPasswordUnchangedError",
    exports: UserErrors,
    message: "旧密码与新密码相同",
    code: ApiErrorCode.BadRequest,
    httpStatus: 400,
  },
  {
    className: "UserHasOpenEmploymentError",
    exports: UserErrors,
    message: "该用户存在开放任职，无法删除",
    code: ApiErrorCode.UserHasActiveEmployment,
    httpStatus: 409,
  },
  {
    className: "OrganizationNotFoundError",
    exports: OrganizationErrors,
    message: "组织不存在",
    code: ApiErrorCode.OrganizationNotFound,
    httpStatus: 404,
  },
  {
    className: "OrganizationAlreadyExistsError",
    exports: OrganizationErrors,
    message: "待创建组织已存在",
    code: ApiErrorCode.OrganizationAlreadyExists,
    httpStatus: 409,
  },
  {
    className: "OrganizationCodeExistsError",
    exports: OrganizationErrors,
    message: "组织编码已存在",
    code: ApiErrorCode.OrganizationCodeExists,
    httpStatus: 409,
  },
  {
    className: "OrganizationHasChildrenError",
    exports: OrganizationErrors,
    message: "该组织下存在子组织，无法删除",
    code: ApiErrorCode.OrganizationHasChildren,
    httpStatus: 409,
  },
  {
    className: "OrganizationHasEmploymentError",
    exports: OrganizationErrors,
    message: "该组织层级内存在开放任职，无法停用或删除",
    code: ApiErrorCode.OrganizationHasEmployment,
    httpStatus: 409,
  },
  {
    className: "OrganizationHasOpenResponsibilityAssignmentError",
    exports: OrganizationErrors,
    message: "该组织层级内存在开放责任任命，无法暂停、停用或删除",
    code: ApiErrorCode.OrganizationHasOpenResponsibilityAssignment,
    httpStatus: 409,
  },
  {
    className: "PositionNotFoundError",
    exports: PositionErrors,
    message: "岗位不存在",
    code: ApiErrorCode.PositionNotFound,
    httpStatus: 404,
  },
  {
    className: "PositionCodeExistsError",
    exports: PositionErrors,
    message: "岗位编码已存在",
    code: ApiErrorCode.PositionCodeExists,
    httpStatus: 409,
  },
  {
    className: "PositionHasEmploymentError",
    exports: PositionErrors,
    message: "该岗位存在开放任职，无法停用或删除",
    code: ApiErrorCode.PositionHasEmployment,
    httpStatus: 409,
  },
  {
    className: "EmploymentNotFoundError",
    exports: EmploymentErrors,
    message: "雇佣关系不存在",
    code: ApiErrorCode.EmploymentNotFound,
    httpStatus: 404,
  },
  {
    className: "EmploymentNotEditableError",
    exports: EmploymentErrors,
    message: "已结束的雇佣关系不能修改",
    code: ApiErrorCode.EmploymentNotEditable,
    httpStatus: 409,
  },
  {
    className: "EmploymentAlreadyExistsError",
    exports: EmploymentErrors,
    message: "相同任职关系已存在",
    code: ApiErrorCode.EmploymentAlreadyExists,
    httpStatus: 409,
  },
  {
    className: "EmploymentOrganizationScopeMismatchError",
    exports: EmploymentErrors,
    message: "任职组织不属于期望组织范围",
    code: ApiErrorCode.BadRequest,
    httpStatus: 400,
  },
  {
    className: "ClientNotFoundError",
    exports: ClientErrors,
    message: "客户端不存在",
    code: ApiErrorCode.ClientNotFound,
    httpStatus: 404,
  },
  {
    className: "ClientCodeExistsError",
    exports: ClientErrors,
    message: "客户端编码已存在",
    code: ApiErrorCode.ClientCodeExists,
    httpStatus: 409,
  },
  {
    className: "RoleNotFoundError",
    exports: RoleErrors,
    message: "角色不存在",
    code: ApiErrorCode.RoleNotFound,
    httpStatus: 404,
  },
  {
    className: "RoleCodeExistsError",
    exports: RoleErrors,
    message: "角色编码已存在",
    code: ApiErrorCode.RoleCodeExists,
    httpStatus: 409,
  },
  {
    className: "RoleHasAssignmentError",
    exports: RoleErrors,
    message: "角色仍存在分配，无法删除",
    code: ApiErrorCode.RoleHasAssignment,
    httpStatus: 409,
  },
  {
    className: "RoleAssignmentExistsError",
    exports: RoleErrors,
    message: "角色分配已存在",
    code: ApiErrorCode.RoleAssignmentExists,
    httpStatus: 409,
  },
  {
    className: "InvalidRoleAssignmentScopeError",
    exports: RoleErrors,
    message: "角色分配作用范围非法",
    code: ApiErrorCode.InvalidRoleAssignmentScope,
    httpStatus: 400,
  },
  {
    className: "RoleAssignmentTargetNotFoundError",
    exports: RoleErrors,
    message: "角色分配目标不存在或不可用",
    code: ApiErrorCode.RoleAssignmentTargetNotFound,
    httpStatus: 404,
  },
  {
    className: "PrivilegeDelegationNotFoundError",
    exports: PrivilegeErrors,
    message: "委托记录不存在",
    code: ApiErrorCode.PrivilegeDelegationNotFound,
    httpStatus: 404,
  },
  {
    className: "PrivilegeDelegationEndedError",
    exports: PrivilegeErrors,
    message: "该委托已结束，不允许再修改",
    code: ApiErrorCode.PrivilegeDelegationEnded,
    httpStatus: 409,
  },
  {
    className: "PrivilegeNotFoundError",
    exports: PrivilegeErrors,
    message: "权限不存在",
    code: ApiErrorCode.PrivilegeNotFound,
    httpStatus: 404,
  },
  {
    className: "PrivilegeAlreadyDelegatedError",
    exports: PrivilegeErrors,
    message: "以下权限已被授权",
    code: ApiErrorCode.PrivilegeAlreadyDelegated,
    httpStatus: 409,
  },
];

function getErrorClass(
  exports: object,
  className: string,
): new () => DomainBusinessError {
  const ErrorClass = (exports as Record<string, unknown>)[className];

  expect(ErrorClass).toBe(
    (Domain as unknown as Record<string, unknown>)[className],
  );
  expect(typeof ErrorClass).toBe("function");

  return ErrorClass as new () => DomainBusinessError;
}

describe("domain business errors", () => {
  test.each(cases)(
    "$className preserves API runtime shape and exports",
    (expected) => {
      const ErrorClass = getErrorClass(expected.exports, expected.className);
      const error = new ErrorClass();

      expect(error).toBeInstanceOf(DomainBusinessError);
      expect(error.name).toBe(expected.className);
      expect(error.message).toBe(expected.message);
      expect(error.code).toBe(expected.code);
      expect(error.httpStatus).toBe(expected.httpStatus);
    },
  );
});
