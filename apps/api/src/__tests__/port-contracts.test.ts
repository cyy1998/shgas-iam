import type { OrcasClient } from "@api/lib/integrations/orcas";
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
import type {
  CustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import type { CustomSsoOrcasLoginPort } from "@api/services/session/custom-sso-session-kernel.port";
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
  RegisterPurveyorEmploymentStorePort,
  RegisterPurveyorMobilePort,
  RegisterPurveyorOrganizationReaderPort,
  RegisterPurveyorPositionReaderPort,
  RegisterPurveyorUserStorePort,
} from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.port";
import type { AuthorizationCodeIssuerPort } from "@api/use-cases/sso/authorize-sso/authorize-sso.port";
import type {
  GatewayLoginCompletionPort,
} from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.port";
import type {
  IndependentAuthorizationGrantPort,
} from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.port";
import type { UserProfileQueryService } from "@iam/user-profile-read-model/query";
import { expect, test } from "bun:test";

function assertAssignable<Port, _Provider extends Port>() {}

type ForbiddenCustomSsoAdapterPublicOperation
  = | "consumeAuthCode"
    | "createLocalSession"
    | "issueClientCredential"
    | "resolveAuthorizationGrant";

type LeakedCustomSsoAdapterPublicOperation = Extract<
  keyof CustomSsoSessionKernelAdapter,
  ForbiddenCustomSsoAdapterPublicOperation
>;

function assertNever<_Value extends never>() {}

test("API providers structurally satisfy consumer-owned ports", () => {
  assertAssignable<ClientReaderPort, ClientRepository>();
  assertAssignable<MobileUserReaderPort, UserRepository>();
  assertAssignable<OrganizationReaderPort, OrganizationRepository>();
  assertAssignable<OrganizationTransactionStorePort, OrganizationRepository>();

  assertAssignable<PrivilegeDelegationUserReaderPort, UserRepository>();
  assertAssignable<PrivilegeDelegationOrganizationReaderPort, OrganizationRepository>();
  assertAssignable<PrivilegeDelegationPrivilegeReaderPort, PrivilegeRepository>();
  assertAssignable<PrivilegeDelegationTransactionStorePort, PrivilegeDelegationRepository>();
  assertAssignable<PrivilegeDelegationSearchPort, PrivilegeDelegationRepository>();

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

  assertAssignable<AuthorizationCodeIssuerPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<IndependentAuthorizationGrantPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<GatewayLoginCompletionPort, CustomSsoSessionKernelAdapter>();
  assertAssignable<CustomSsoOrcasLoginPort, OrcasClient>();
  assertNever<LeakedCustomSsoAdapterPublicOperation>();

  expect(true).toBe(true);
});
