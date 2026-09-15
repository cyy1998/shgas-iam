import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
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
import { mapUnitOfWork } from "@iam/api-core/uow";
import { createRootSecurityComposition } from "../root-security";
import { createClientSsoSnapshotManagement } from "./client-sso-snapshots";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiServicesOptions {
  db: DbClient;
  auditService: Pick<AdminAuditService, "recordAuditLog">;
  roleAssignmentResolver: RoleAssignmentResolver;
  runtime: AdminApiRuntimePorts;
  repositories: AdminApiRepositories;
  session: Pick<
    AdminApiSession,
    "kernel" | "loginRestriction" | "revocation" | "subjectAccessLifecycle" | "subjectAccess"
  >;
  unitOfWork: AdminApiUnitOfWork;
}

export function createAdminApiServices(options: CreateAdminApiServicesOptions) {
  const { roleAssignmentResolver, runtime, repositories, session, unitOfWork } = options;
  const rootSecurity = createRootSecurityComposition({
    kernel: session.kernel,
    barrier: session.subjectAccess,
    config: { allowedClientCodes: runtime.config.auth.adminClientCodes },
    sessions: {
      audit: options.auditService,
      loginRestrictions: session.loginRestriction,
      logger: runtime.logger,
      users: repositories.user,
    },
    user: {
      userRepository: repositories.user,
      employmentRepository: repositories.employment,
      roleAssignmentResolver,
      roleRepository: repositories.role,
      privilegeRepository: repositories.privilege,
      passwordHasher: runtime.passwordHasher,
      random: runtime.random,
      subjectAccessLifecycle: session.subjectAccessLifecycle,
      uow: mapUnitOfWork(unitOfWork, tx => ({
        userRepository: tx.repositories.user,
        auditService: tx.auditService,
        subjectAccessMutation: tx.subjectAccessMutation,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    },
  });

  const clientSso = createClientSsoSnapshotManagement({
    clientCache: runtime.integrations.clientCache,
    db: options.db,
    redis: runtime.redis,
    logger: runtime.logger,
    callback: {
      isManagedCallback: callback => [runtime.config.env.sso.internalOrigin, runtime.config.env.sso.externalOrigin]
        .some(origin => new URL("/sso/callback", origin).href === new URL(callback).href),
    },
    sessionTermination: {
      async revokeClientSessions(clientCode) {
        const result = await rootSecurity.revocation.revokeClientSessions(clientCode);
        if (result.unfinished.length > 0)
          throw new Error("Client session termination was not confirmed");
        return result;
      },
    },
  });
  const clientService = createClientService({
    clientRepository: repositories.client,
    clientCache: runtime.integrations.clientCache,
    clientRuntimeInvalidation: clientSso.snapshots,
    clientMutationLogger: runtime.logger,
    management: clientSso.management.service,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      clientRepository: tx.repositories.client,
      auditService: tx.auditService,
    })),
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    responsibilityReader: repositories.organizationResponsibility,
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
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  return {
    client: clientService,
    clientSso: clientSso.management,
    employment: employmentService,
    organization: organizationService,
    organizationResponsibility: organizationResponsibilityService,
    position: positionService,
    role: roleService,
    rootSecurity,
    sessionManagement: rootSecurity.sessionManagement,
    user: rootSecurity.user,
  };
}

export type AdminApiServices = ReturnType<typeof createAdminApiServices>;
