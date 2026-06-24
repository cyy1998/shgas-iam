export enum ApiErrorCode {
  InternalError = "COMMON.INTERNAL_ERROR",
  NotFound = "COMMON.NOT_FOUND",
  BadRequest = "COMMON.BAD_REQUEST",
  ValidationFailed = "COMMON.VALIDATION_FAILED",

  Unauthorized = "AUTH.UNAUTHORIZED",
  Forbidden = "AUTH.FORBIDDEN",
  Maintenance = "AUTH.MAINTENANCE",

  InvalidLoginCredential = "LOGIN.INVALID_CREDENTIAL",
  LoginFailed = "LOGIN.FAILED",
  InvalidVerificationCode = "LOGIN.INVALID_VERIFICATION_CODE",
  HumanVerificationRequired = "LOGIN.HUMAN_VERIFICATION_REQUIRED",

  InvalidHumanVerificationSite = "HUMAN_VERIFICATION.INVALID_SITE",

  UserNotFound = "USER.NOT_FOUND",
  UsernameAlreadyExists = "USER.USERNAME_ALREADY_EXISTS",
  InvalidMobile = "USER.INVALID_MOBILE",
  MobileAlreadyExists = "USER.MOBILE_ALREADY_EXISTS",
  WeakPassword = "USER.WEAK_PASSWORD",
  InvalidOldPassword = "USER.INVALID_OLD_PASSWORD",
  UserHasActiveEmployment = "USER.HAS_ACTIVE_EMPLOYMENT",

  OrganizationNotFound = "ORG.NOT_FOUND",
  OrganizationAlreadyExists = "ORG.ALREADY_EXISTS",
  OrganizationCodeExists = "ORG.CODE_EXISTS",
  OrganizationHasChildren = "ORG.HAS_CHILDREN",
  OrganizationHasEmployment = "ORG.HAS_EMPLOYMENT",

  PositionNotFound = "POSITION.NOT_FOUND",
  PositionCodeExists = "POSITION.CODE_EXISTS",
  PositionHasEmployment = "POSITION.HAS_EMPLOYMENT",

  EmploymentNotFound = "EMPLOYMENT.NOT_FOUND",
  EmploymentNotEditable = "EMPLOYMENT.NOT_EDITABLE",
  EmploymentAlreadyExists = "EMPLOYMENT.ALREADY_EXISTS",

  ClientNotFound = "CLIENT.NOT_FOUND",
  ClientCodeExists = "CLIENT.CODE_EXISTS",

  InvalidSsoClient = "SSO.INVALID_CLIENT",
  InvalidRedirectUri = "SSO.INVALID_REDIRECT_URI",
  InvalidAuthCode = "SSO.INVALID_AUTH_CODE",

  PrivilegeDelegationNotFound = "PRIVILEGE.DELEGATION_NOT_FOUND",
  PrivilegeDelegationEnded = "PRIVILEGE.DELEGATION_ENDED",
  PrivilegeNotFound = "PRIVILEGE.NOT_FOUND",
  PrivilegeAlreadyDelegated = "PRIVILEGE.ALREADY_DELEGATED",

  OrcasLoginFailed = "INTEGRATION.ORCAS_LOGIN_FAILED",
}
