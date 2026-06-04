import { ApiErrorCode } from "@iam/contracts";
import * as Domain from "@iam/domain";
import * as ClientErrors from "@iam/domain/client";
import * as EmploymentErrors from "@iam/domain/employment";
import * as OrganizationErrors from "@iam/domain/organization";
import * as PositionErrors from "@iam/domain/position";
import * as PrivilegeErrors from "@iam/domain/privilege";
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
    className: "UserHasActiveEmploymentError",
    exports: UserErrors,
    message: "该用户仍存在活跃雇佣，无法删除",
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
    message: "该组织下存在雇佣关系，无法删除",
    code: ApiErrorCode.OrganizationHasEmployment,
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
    message: "该岗位下存在雇佣关系，无法删除",
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

function getErrorClass(exports: object, className: string): new () => DomainBusinessError {
  const ErrorClass = (exports as Record<string, unknown>)[className];

  expect(ErrorClass).toBe((Domain as unknown as Record<string, unknown>)[className]);
  expect(typeof ErrorClass).toBe("function");

  return ErrorClass as new () => DomainBusinessError;
}

describe("domain business errors", () => {
  test.each(cases)("$className preserves API runtime shape and exports", (expected) => {
    const ErrorClass = getErrorClass(expected.exports, expected.className);
    const error = new ErrorClass();

    expect(error).toBeInstanceOf(DomainBusinessError);
    expect(error.name).toBe(expected.className);
    expect(error.message).toBe(expected.message);
    expect(error.code).toBe(expected.code);
    expect(error.httpStatus).toBe(expected.httpStatus);
  });
});
