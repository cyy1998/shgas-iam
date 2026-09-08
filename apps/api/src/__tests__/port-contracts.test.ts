import type { PrivilegeDelegationResolutionRepository } from "@api/composition/repositories/privilege-delegation-resolution.repository";
import type { OrcasClient } from "@api/lib/integrations/orcas";
import type { PrincipalSessionAdapter } from "@api/services/authentication/principal-session.adapter";
import type { ClientReaderPort } from "@api/services/client/client.port";
import type { ClientRepository } from "@api/services/client/client.repository";
import type {
  CustomSsoClientRuntimeReader,
} from "@api/services/client/custom-sso-client-runtime.reader";
import type { CustomSsoClientRepository } from "@api/services/client/custom-sso-client.repository";
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
import type {
  UserDelegationReaderPort,
  UserMobileBindingPort,
  UserMobileVerificationPort,
  UserProfileReaderPort,
  UserStorePort,
  UserTransactionStorePort,
} from "@api/services/user/user.port";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UserService } from "@api/services/user/user.service";
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
import type { ClientSubjectProjectionService } from "@iam/client-subject-projection";
import type {
  CustomSsoSubjectProjectionPort,
} from "@iam/custom-sso";
import type {
  AuthorizationCodeIssuerPort,
  AuthorizeSsoClientReaderPort,
  CustomSsoClientSecretReader,
  CustomSsoGatewayOrcasUserPort,
  CustomSsoOrcasLoginPort,
  CustomSsoSessionKernelAdapter,
  CustomSsoSubjectDelivery,
  CustomSsoSubjectDeliveryPort,
  GatewayCallbackClientReaderPort,
  GatewayLoginCompletionPort,
  IndependentAuthorizationGrantPort,
} from "@iam/custom-sso/testing";

import type { SessionOrigin } from "@iam/session-kernel";
import type { UserProfileQueryService } from "@iam/user-profile-read-model/query";
import { expect, test } from "bun:test";

function assertAssignable<Port, _Provider extends Port>() {}
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

test("API providers structurally satisfy consumer-owned ports", () => {
  assertAssignable<ClientReaderPort, ClientRepository>();
  assertAssignable<CustomSsoClientSecretReader, CustomSsoClientRepository>();
  assertAssignable<
    GatewayCallbackClientReaderPort,
    CustomSsoClientRuntimeReader
  >();
  assertAssignable<
    AuthorizeSsoClientReaderPort,
    CustomSsoClientRuntimeReader
  >();
  assertAssignable<MobileUserReaderPort, UserRepository>();
  assertAssignable<OrganizationReaderPort, OrganizationRepository>();
  assertAssignable<OrganizationTransactionStorePort, OrganizationRepository>();

  assertAssignable<PrivilegeDelegationUserReaderPort, UserRepository>();
  assertAssignable<PrivilegeDelegationOrganizationReaderPort, OrganizationRepository>();
  assertAssignable<PrivilegeDelegationPrivilegeReaderPort, PrivilegeRepository>();
  assertAssignable<PrivilegeDelegationTransactionStorePort, PrivilegeDelegationRepository>();
  assertAssignable<PrivilegeDelegationSearchPort, PrivilegeDelegationRepository>();
  assertAssignable<
    PrivilegeDelegationResolutionPort,
    PrivilegeDelegationResolutionRepository
  >();

  assertAssignable<UserProfileReaderPort, UserProfileQueryService>();
  assertAssignable<UserDelegationReaderPort, PrivilegeDelegationRepository>();
  assertAssignable<UserMobileBindingPort, MobileService>();
  assertAssignable<UserMobileVerificationPort, MobileService>();
  assertAssignable<UserStorePort, UserRepository>();
  assertAssignable<UserTransactionStorePort, UserRepository>();

  assertAssignable<RegisterPurveyorEmploymentStorePort, EmploymentRepository>();
  assertAssignable<RegisterPurveyorOrganizationReaderPort, OrganizationRepository>();
  assertAssignable<RegisterPurveyorPositionReaderPort, PositionRepository>();
  assertAssignable<RegisterPurveyorUserStorePort, UserRepository>();
  assertAssignable<RegisterPurveyorMobilePort, MobileService>();

  assertAssignable<PasswordLoginRestrictionPort, LoginRestriction>();
  assertAssignable<MobileLoginRestrictionPort, LoginRestriction>();
  assertAssignable<PasswordPrincipalSessionPort, PrincipalSessionAdapter>();
  assertAssignable<MobilePrincipalSessionPort, PrincipalSessionAdapter>();
  assertAssignable<OaPrincipalSessionPort, PrincipalSessionAdapter>();
  assertAssignable<WechatPrincipalSessionPort, PrincipalSessionAdapter>();

  assertAssignable<AuthorizationCodeIssuerPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<IndependentAuthorizationGrantPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<GatewayLoginCompletionPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<CustomSsoOrcasLoginPort, OrcasClient>();
  assertAssignable<
    CustomSsoSubjectProjectionPort,
    ClientSubjectProjectionService
  >();
  assertAssignable<CustomSsoSubjectDeliveryPort, CustomSsoSubjectDelivery>();
  assertAssignable<CustomSsoGatewayOrcasUserPort, UserService>();

  expect(true).toBe(true);
});
