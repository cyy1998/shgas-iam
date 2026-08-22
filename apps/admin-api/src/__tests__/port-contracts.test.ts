import type {
  AdminClientReaderPort,
  AdminClientTransactionStorePort,
} from "@admin-api/services/client/client.port";
import type { ClientRepository } from "@admin-api/services/client/client.repository";
import type {
  AdminEmploymentEffectiveRoleResolverPort,
  AdminEmploymentPrivilegeReaderPort,
  AdminEmploymentReaderPort,
  AdminEmploymentStorePort,
} from "@admin-api/services/employment/employment.port";
import type { EmploymentRepository } from "@admin-api/services/employment/employment.repository";
import type { OrganizationResponsibilityRepository } from "@admin-api/services/organization-responsibility/organization-responsibility.repository";
import type {
  AdminOrganizationReaderPort,
  AdminOrganizationTransactionStorePort,
} from "@admin-api/services/organization/organization.port";
import type { OrganizationRepository } from "@admin-api/services/organization/organization.repository";
import type {
  AdminPositionReaderPort,
  AdminPositionTransactionStorePort,
} from "@admin-api/services/position/position.port";
import type { PositionRepository } from "@admin-api/services/position/position.repository";
import type { PrivilegeRepository } from "@admin-api/services/privilege/privilege.repository";
import type {
  AdminRoleReaderPort,
  AdminRoleTransactionStorePort,
} from "@admin-api/services/role/role.port";
import type { RoleRepository } from "@admin-api/services/role/role.repository";
import type {
  AdminLoginRestrictionPort,
  AdminSessionControlPort,
  AdminSessionInventoryPort,
  AdminSessionUserControlPort,
  AdminSessionUserSummaryPort,
} from "@admin-api/services/session-management/session-management.port";
import type { AdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import type {
  AdminUserEffectiveRoleResolverPort,
  AdminUserEmploymentReaderPort,
  AdminUserPrivilegeReaderPort,
  AdminUserReaderPort,
  AdminUserTransactionStorePort,
} from "@admin-api/services/user/user.port";
import type { UserRepository } from "@admin-api/services/user/user.repository";
import type { ResignUserSessionRevocationPort } from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { CreateOrganizationResponsibilityAssignmentTransactionPorts } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.port";
import type { ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.port";
import type { LoginRestriction } from "@iam/api-core/login-restriction";
import type { SessionKernel } from "@iam/api-core/session/kernel";
import type { RoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { expect, test } from "bun:test";

function assertAssignable<Port, _Provider extends Port>() {}

test("Admin API providers structurally satisfy consumer-owned ports", () => {
  type RevokeUserInput = Parameters<
    AdminSessionUserControlPort["revokeUserSessions"]
  >[0];
  // @ts-expect-error Admin user Session Revocation always requires server audit context.
  const missingAuditContext: RevokeUserInput = {
    userId: 1,
    reason: "admin_revoke",
  };
  void missingAuditContext;

  assertAssignable<AdminClientReaderPort, ClientRepository>();
  assertAssignable<AdminClientTransactionStorePort, ClientRepository>();

  assertAssignable<AdminEmploymentReaderPort, EmploymentRepository>();
  assertAssignable<AdminEmploymentStorePort, EmploymentRepository>();
  assertAssignable<
    AdminEmploymentEffectiveRoleResolverPort,
    RoleAssignmentResolver
  >();
  assertAssignable<AdminEmploymentPrivilegeReaderPort, PrivilegeRepository>();

  assertAssignable<AdminOrganizationReaderPort, OrganizationRepository>();
  assertAssignable<
    AdminOrganizationTransactionStorePort,
    OrganizationRepository
  >();
  assertAssignable<
    CreateOrganizationResponsibilityAssignmentTransactionPorts["assignmentStore"],
    OrganizationResponsibilityRepository
  >();
  assertAssignable<
    CreateOrganizationResponsibilityAssignmentTransactionPorts["employmentReader"],
    OrganizationResponsibilityRepository
  >();
  assertAssignable<
    CreateOrganizationResponsibilityAssignmentTransactionPorts["organizationReader"],
    OrganizationResponsibilityRepository
  >();
  assertAssignable<
    ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts["assignmentStore"],
    OrganizationResponsibilityRepository
  >();
  assertAssignable<AdminPositionReaderPort, PositionRepository>();
  assertAssignable<AdminPositionTransactionStorePort, PositionRepository>();
  assertAssignable<AdminRoleReaderPort, RoleRepository>();
  assertAssignable<AdminRoleTransactionStorePort, RoleRepository>();

  assertAssignable<AdminUserReaderPort, UserRepository>();
  assertAssignable<AdminUserTransactionStorePort, UserRepository>();
  assertAssignable<AdminUserEmploymentReaderPort, EmploymentRepository>();
  assertAssignable<
    AdminUserEffectiveRoleResolverPort,
    RoleAssignmentResolver
  >();
  assertAssignable<AdminUserPrivilegeReaderPort, PrivilegeRepository>();

  assertAssignable<AdminSessionInventoryPort, SessionKernel>();
  assertAssignable<AdminSessionControlPort, SessionKernel>();
  assertAssignable<AdminLoginRestrictionPort, LoginRestriction>();
  assertAssignable<AdminSessionUserControlPort, AdminSessionRevocationPort>();
  assertAssignable<AdminSessionUserSummaryPort, UserRepository>();
  assertAssignable<
    ResignUserSessionRevocationPort,
    AdminSessionRevocationPort
  >();

  expect(true).toBe(true);
});
