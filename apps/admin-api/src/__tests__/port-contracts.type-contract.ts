import type { createUnifiedAdminLifecycleRevocation } from "@admin-api/composition/session/unified-lifecycle";
import type { AdminClientReaderPort, AdminClientTransactionStorePort } from "@admin-api/services/client/client.port";
import type { ClientRepository } from "@admin-api/services/client/client.repository";
import type { ClientAdmissionEvaluatorPort } from "@admin-api/services/client-admission/client-admission.port";
import type {
  CustomAttributeDefinitionReader,
  CustomAttributeDefinitionStore,
  CustomAttributeValueWritePort,
} from "@admin-api/services/custom-attribute/custom-attribute.port";
import type { createCustomAttributeRepository } from "@admin-api/services/custom-attribute/custom-attribute.repository";
import type {
  AdminEmploymentEffectiveRoleResolverPort,
  AdminEmploymentReaderPort,
} from "@admin-api/services/employment/employment.port";
import type { EmploymentRepository } from "@admin-api/services/employment/employment.repository";
import type {
  AdminOrganizationReaderPort,
  AdminOrganizationTransactionStorePort,
} from "@admin-api/services/organization/organization.port";
import type { OrganizationRepository } from "@admin-api/services/organization/organization.repository";
import type { OrganizationResponsibilityRepository } from "@admin-api/services/organization-responsibility/organization-responsibility.repository";
import type {
  AdminPositionReaderPort,
  AdminPositionTransactionStorePort,
} from "@admin-api/services/position/position.port";
import type { PositionRepository } from "@admin-api/services/position/position.repository";
import type { AdminRoleReaderPort, AdminRoleTransactionStorePort } from "@admin-api/services/role/role.port";
import type { RoleRepository } from "@admin-api/services/role/role.repository";
import type {
  AdminLoginRestrictionPort,
  AdminSessionUserControlPort,
  AdminSessionUserSummaryPort,
} from "@admin-api/services/session-management/session-management.port";
import type {
  AdminUserEffectiveRoleResolverPort,
  AdminUserEmploymentReaderPort,
  AdminUserReaderPort,
  AdminUserTransactionStorePort,
} from "@admin-api/services/user/user.port";
import type { UserRepository } from "@admin-api/services/user/user.repository";
import type {
  ResignUserReaderPort,
  ResignUserSessionRevocationPort,
  ResignUserTransactionPorts,
} from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { UpdateEmploymentTransactionPorts } from "@admin-api/use-cases/employment/update-employment/update-employment.port";
import type { CreateOrganizationResponsibilityAssignmentTransactionPorts } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.port";
import type { ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.port";
import type { LockedEmploymentEndStorePort } from "@iam/assignment-resolution/employment-lifecycle";
import type { LockedAssignmentEndStorePort } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import type { RoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import type { createApplicationAdmissionEvaluator } from "@iam/documents/user/admission";
import type { LoginRestriction } from "@iam/login-restriction";

type AdminSessionRevocationPort = ReturnType<typeof createUnifiedAdminLifecycleRevocation>;

type AssertAssignable<Port, _Provider extends Port> = true;

type RevokeUserInput = Parameters<AdminSessionUserControlPort["revokeUserSessions"]>[0];
// @ts-expect-error Admin user Session Revocation always requires server audit context.
const missingAuditContext: RevokeUserInput = {
  userId: 1,
  reason: "admin_revoke",
};
void missingAuditContext;

type _AdminClientReaderPort = AssertAssignable<AdminClientReaderPort, ClientRepository>;
type _AdminClientTransactionStorePort = AssertAssignable<AdminClientTransactionStorePort, ClientRepository>;
type _ClientAdmissionEvaluatorPort = AssertAssignable<
  ClientAdmissionEvaluatorPort,
  ReturnType<typeof createApplicationAdmissionEvaluator>
>;

type CustomAttributeRepository = ReturnType<typeof createCustomAttributeRepository>;
type _CustomAttributeDefinitionReader = AssertAssignable<CustomAttributeDefinitionReader, CustomAttributeRepository>;
type _CustomAttributeDefinitionStore = AssertAssignable<CustomAttributeDefinitionStore, CustomAttributeRepository>;
type _CustomAttributeValueWritePort = AssertAssignable<CustomAttributeValueWritePort, CustomAttributeRepository>;

type _AdminEmploymentReaderPort = AssertAssignable<AdminEmploymentReaderPort, EmploymentRepository>;
type _UpdateEmploymentStorePort = AssertAssignable<
  UpdateEmploymentTransactionPorts["employmentStore"],
  EmploymentRepository
>;
type _LockedEmploymentEndStorePort = AssertAssignable<LockedEmploymentEndStorePort, EmploymentRepository>;
type _LockedAssignmentEndStorePort = AssertAssignable<
  LockedAssignmentEndStorePort,
  OrganizationResponsibilityRepository
>;
type _AdminEmploymentEffectiveRoleResolverPort = AssertAssignable<
  AdminEmploymentEffectiveRoleResolverPort,
  RoleAssignmentResolver
>;

type _AdminOrganizationReaderPort = AssertAssignable<AdminOrganizationReaderPort, OrganizationRepository>;
type _AdminOrganizationTransactionStorePort = AssertAssignable<
  AdminOrganizationTransactionStorePort,
  OrganizationRepository
>;
type _CreateOrganizationResponsibilityAssignmentTransactionPortsassignmentStore = AssertAssignable<
  CreateOrganizationResponsibilityAssignmentTransactionPorts["assignmentStore"],
  OrganizationResponsibilityRepository
>;
type _CreateOrganizationResponsibilityAssignmentTransactionPortsemploymentReader = AssertAssignable<
  CreateOrganizationResponsibilityAssignmentTransactionPorts["employmentReader"],
  OrganizationResponsibilityRepository
>;
type _CreateOrganizationResponsibilityAssignmentTransactionPortsorganizationReader = AssertAssignable<
  CreateOrganizationResponsibilityAssignmentTransactionPorts["organizationReader"],
  OrganizationResponsibilityRepository
>;
type _ManageOrganizationResponsibilityAssignmentLifecycleTransactionPortsassignmentStore = AssertAssignable<
  ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts["assignmentStore"],
  OrganizationResponsibilityRepository
>;
type _AdminPositionReaderPort = AssertAssignable<AdminPositionReaderPort, PositionRepository>;
type _AdminPositionTransactionStorePort = AssertAssignable<AdminPositionTransactionStorePort, PositionRepository>;
type _AdminRoleReaderPort = AssertAssignable<AdminRoleReaderPort, RoleRepository>;
type _AdminRoleTransactionStorePort = AssertAssignable<AdminRoleTransactionStorePort, RoleRepository>;

type _AdminUserReaderPort = AssertAssignable<AdminUserReaderPort, UserRepository>;
type _AdminUserTransactionStorePort = AssertAssignable<AdminUserTransactionStorePort, UserRepository>;
type _ResignUserReaderPort = AssertAssignable<ResignUserReaderPort, UserRepository>;
type _ResignUserTransactionPortsuserStore = AssertAssignable<ResignUserTransactionPorts["userStore"], UserRepository>;
type _AdminUserEmploymentReaderPort = AssertAssignable<AdminUserEmploymentReaderPort, EmploymentRepository>;
type _AdminUserEffectiveRoleResolverPort = AssertAssignable<AdminUserEffectiveRoleResolverPort, RoleAssignmentResolver>;

type _AdminLoginRestrictionPort = AssertAssignable<AdminLoginRestrictionPort, LoginRestriction>;
type _AdminSessionUserSummaryPort = AssertAssignable<AdminSessionUserSummaryPort, UserRepository>;
type _ResignUserSessionRevocationPort = AssertAssignable<ResignUserSessionRevocationPort, AdminSessionRevocationPort>;
