import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type {
  AdminLoginRestrictionPort,
  AdminSessionControlPort,
  AdminSessionInventoryPort,
  AdminSessionUserSummaryPort,
} from "@admin-api/services/session-management/session-management.port";
import type { RoleAssignmentResolver } from "@iam/role-assignment-resolution";
import type { AdminApiRepositories } from "../repositories";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiSession } from "../session";
import type { createAdminApiUnitOfWork } from "../tx";
import { createClientService } from "@admin-api/services/client/client.service";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createOrganizationResponsibilityService } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createRoleService } from "@admin-api/services/role/role.service";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { createUserService } from "@admin-api/services/user/user.service";
import { mapUnitOfWork } from "@iam/api-core/uow";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiServicesOptions {
  auditService: Pick<AdminAuditService, "recordAuditLog">;
  roleAssignmentResolver: RoleAssignmentResolver;
  runtime: AdminApiRuntimePorts;
  repositories: AdminApiRepositories;
  session: Pick<
    AdminApiSession,
    "kernel" | "loginRestriction" | "revocation" | "subjectAccessLifecycle"
  >;
  unitOfWork: AdminApiUnitOfWork;
}

export function createAdminApiServices(options: CreateAdminApiServicesOptions) {
  const { roleAssignmentResolver, runtime, repositories, session, unitOfWork } = options;
  const sessionControl: AdminSessionControlPort = session.kernel;
  const sessionInventory: AdminSessionInventoryPort = session.kernel;
  const sessionLoginRestrictions: AdminLoginRestrictionPort = session.loginRestriction;
  const sessionUsers: AdminSessionUserSummaryPort = repositories.user;
  const sessionManagementService = createSessionManagementService({
    audit: options.auditService,
    control: sessionControl,
    inventory: sessionInventory,
    loginRestrictions: sessionLoginRestrictions,
    logger: runtime.logger,
    userControl: session.revocation,
    users: sessionUsers,
  });

  const userService = createUserService({
    userRepository: repositories.user,
    employmentRepository: repositories.employment,
    roleAssignmentResolver,
    privilegeRepository: repositories.privilege,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    sessionRevocation: session.revocation,
    subjectAccessLifecycle: session.subjectAccessLifecycle,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditService: tx.auditService,
      subjectAccessMutation: tx.subjectAccessMutation,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const clientService = createClientService({
    clientRepository: repositories.client,
    clientCache: runtime.integrations.clientCache,
    sessionRevocation: session.revocation,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      clientRepository: tx.repositories.client,
      auditService: tx.auditService,
    })),
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
      auditService: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const organizationResponsibilityService = createOrganizationResponsibilityService({
    repository: repositories.organizationResponsibility,
  });

  const positionService = createPositionService({
    positionRepository: repositories.position,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      positionRepository: tx.repositories.position,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const roleService = createRoleService({
    roleRepository: repositories.role,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      roleRepository: tx.repositories.role,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const employmentService = createEmploymentService({
    employmentRepository: repositories.employment,
    roleAssignmentResolver,
    privilegeRepository: repositories.privilege,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  return {
    client: clientService,
    employment: employmentService,
    organization: organizationService,
    organizationResponsibility: organizationResponsibilityService,
    position: positionService,
    role: roleService,
    sessionManagement: sessionManagementService,
    user: userService,
  };
}

export type AdminApiServices = ReturnType<typeof createAdminApiServices>;
