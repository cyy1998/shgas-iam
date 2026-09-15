import type { PrivilegeDelegationResolutionRepository } from "@api/composition/repositories/privilege-delegation-resolution.repository";
import type { createUserSessionAuthenticationAdapter } from "@api/services/authentication/user-session.adapter";
import type { ClientReaderPort } from "@api/services/client/client.port";
import type { ClientRepository } from "@api/services/client/client.repository";
import type { EmploymentRepository } from "@api/services/employment/employment.repository";
import type { MobileUserReaderPort } from "@api/services/mobile/mobile.port";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type {
  OrganizationReaderPort,
  OrganizationTransactionStorePort,
} from "@api/services/organization/organization.port";
import type { OrganizationRepository } from "@api/services/organization/organization.repository";
import type { PositionRepository } from "@api/services/position/position.repository";
import type { PrivilegeRepository } from "@api/services/privilege/privilege.repository";
import type {
  PrivilegeDelegationOrganizationReaderPort,
  PrivilegeDelegationPrivilegeReaderPort,
  PrivilegeDelegationSearchPort,
  PrivilegeDelegationTransactionStorePort,
  PrivilegeDelegationUserReaderPort,
} from "@api/services/privilege/privilegeDelegation.port";
import type { PrivilegeDelegationRepository } from "@api/services/privilege/privilegeDelegation.repository";
import type { SessionOrigin } from "@api/services/session/session-origin";
import type {
  UserDelegationReaderPort,
  UserMobileBindingPort,
  UserMobileVerificationPort,
  UserProfileReaderPort,
  UserStorePort,
  UserTransactionStorePort,
} from "@api/services/user/user.port";
import type { UserRepository } from "@api/services/user/user.repository";
import type {
  MobileLoginRestrictionPort,
  MobilePrincipalSessionPort,
} from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.port";
import type { OaPrincipalSessionPort } from "@api/use-cases/authentication/login-with-oa/login-with-oa.port";
import type {
  PasswordLoginRestrictionPort,
  PasswordPrincipalSessionPort,
} from "@api/use-cases/authentication/login-with-password/login-with-password.port";
import type { WechatPrincipalSessionPort } from "@api/use-cases/authentication/login-with-wechat/login-with-wechat.port";
import type {
  RegisterPurveyorEmploymentStorePort,
  RegisterPurveyorMobilePort,
  RegisterPurveyorOrganizationReaderPort,
  RegisterPurveyorPositionReaderPort,
  RegisterPurveyorUserStorePort,
} from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.port";
import type {
  PrivilegeDelegationResolutionPort,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.port";

import type { LoginRestriction } from "@iam/api-core/login-restriction";
import type { UserProfileQueryService } from "@iam/user-profile-read-model/query";

type PrincipalSessionAdapter = ReturnType<typeof createUserSessionAuthenticationAdapter>;

type AssertAssignable<Port, _Provider extends Port> = true;
function assertPrincipalSessionCreationContracts(
  passwordSessions: PasswordPrincipalSessionPort,
  mobileSessions: MobilePrincipalSessionPort,
  oaSessions: OaPrincipalSessionPort,
  wechatSessions: WechatPrincipalSessionPort,
  subjectIdentifier: string,
  origin: SessionOrigin,
) {
  void passwordSessions.createPrincipalSession(subjectIdentifier, { amr: ["pwd"], origin });
  // @ts-expect-error password sessions require the password AMR
  void passwordSessions.createPrincipalSession(subjectIdentifier, { origin });
  // @ts-expect-error password sessions reject other authentication methods
  void passwordSessions.createPrincipalSession(subjectIdentifier, { amr: ["sms"], origin });

  void mobileSessions.createPrincipalSession(subjectIdentifier, { amr: ["sms"], origin });
  // @ts-expect-error mobile sessions require the SMS AMR
  void mobileSessions.createPrincipalSession(subjectIdentifier, { origin });
  // @ts-expect-error mobile sessions reject other authentication methods
  void mobileSessions.createPrincipalSession(subjectIdentifier, { amr: ["pwd"], origin });

  void oaSessions.createPrincipalSession(subjectIdentifier, { amr: ["oa"], origin });
  // @ts-expect-error OA sessions require the OA AMR
  void oaSessions.createPrincipalSession(subjectIdentifier, { origin });
  // @ts-expect-error OA sessions reject other authentication methods
  void oaSessions.createPrincipalSession(subjectIdentifier, { amr: ["wechat"], origin });

  void wechatSessions.createPrincipalSession(subjectIdentifier, { amr: ["wechat"], origin });
  // @ts-expect-error WeChat sessions require the WeChat AMR
  void wechatSessions.createPrincipalSession(subjectIdentifier, { origin });
  // @ts-expect-error WeChat sessions reject other authentication methods
  void wechatSessions.createPrincipalSession(subjectIdentifier, { amr: ["oa"], origin });
}

void assertPrincipalSessionCreationContracts;

type _ClientReaderPort = AssertAssignable<ClientReaderPort, ClientRepository>;
type _MobileUserReaderPort = AssertAssignable<MobileUserReaderPort, UserRepository>;
type _OrganizationReaderPort = AssertAssignable<OrganizationReaderPort, OrganizationRepository>;
type _OrganizationTransactionStorePort = AssertAssignable<OrganizationTransactionStorePort, OrganizationRepository>;

type _PrivilegeDelegationUserReaderPort = AssertAssignable<PrivilegeDelegationUserReaderPort, UserRepository>;
type _PrivilegeDelegationOrganizationReaderPort = AssertAssignable<
  PrivilegeDelegationOrganizationReaderPort,
  OrganizationRepository
>;
type _PrivilegeDelegationPrivilegeReaderPort = AssertAssignable<
  PrivilegeDelegationPrivilegeReaderPort,
  PrivilegeRepository
>;
type _PrivilegeDelegationTransactionStorePort = AssertAssignable<
  PrivilegeDelegationTransactionStorePort,
  PrivilegeDelegationRepository
>;
type _PrivilegeDelegationSearchPort = AssertAssignable<PrivilegeDelegationSearchPort, PrivilegeDelegationRepository>;
type _PrivilegeDelegationResolutionPort = AssertAssignable<
  PrivilegeDelegationResolutionPort,
  PrivilegeDelegationResolutionRepository
>;

type _UserProfileReaderPort = AssertAssignable<UserProfileReaderPort, UserProfileQueryService>;
type _UserDelegationReaderPort = AssertAssignable<UserDelegationReaderPort, PrivilegeDelegationRepository>;
type _UserMobileBindingPort = AssertAssignable<UserMobileBindingPort, MobileService>;
type _UserMobileVerificationPort = AssertAssignable<UserMobileVerificationPort, MobileService>;
type _UserStorePort = AssertAssignable<UserStorePort, UserRepository>;
type _UserTransactionStorePort = AssertAssignable<UserTransactionStorePort, UserRepository>;

type _RegisterPurveyorEmploymentStorePort = AssertAssignable<RegisterPurveyorEmploymentStorePort, EmploymentRepository>;
type _RegisterPurveyorOrganizationReaderPort = AssertAssignable<
  RegisterPurveyorOrganizationReaderPort,
  OrganizationRepository
>;
type _RegisterPurveyorPositionReaderPort = AssertAssignable<RegisterPurveyorPositionReaderPort, PositionRepository>;
type _RegisterPurveyorUserStorePort = AssertAssignable<RegisterPurveyorUserStorePort, UserRepository>;
type _RegisterPurveyorMobilePort = AssertAssignable<RegisterPurveyorMobilePort, MobileService>;

type _PasswordLoginRestrictionPort = AssertAssignable<PasswordLoginRestrictionPort, LoginRestriction>;
type _MobileLoginRestrictionPort = AssertAssignable<MobileLoginRestrictionPort, LoginRestriction>;
type _PasswordPrincipalSessionPort = AssertAssignable<PasswordPrincipalSessionPort, PrincipalSessionAdapter>;
type _MobilePrincipalSessionPort = AssertAssignable<MobilePrincipalSessionPort, PrincipalSessionAdapter>;
type _OaPrincipalSessionPort = AssertAssignable<OaPrincipalSessionPort, PrincipalSessionAdapter>;
type _WechatPrincipalSessionPort = AssertAssignable<WechatPrincipalSessionPort, PrincipalSessionAdapter>;
