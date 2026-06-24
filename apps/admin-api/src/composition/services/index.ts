import type { AdminApiRepositories } from "../repositories";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiSession } from "../session";
import type { createAdminApiUnitOfWork } from "../tx";
import { createClientService } from "@admin-api/services/client/client.service";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createUserService } from "@admin-api/services/user/user.service";
import { mapUnitOfWork } from "@iam/api-core/uow";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiServicesOptions {
  runtime: AdminApiRuntimePorts;
  repositories: AdminApiRepositories;
  session: Pick<AdminApiSession, "revocation">;
  unitOfWork: AdminApiUnitOfWork;
}

export function createAdminApiServices(options: CreateAdminApiServicesOptions) {
  const { runtime, repositories, session, unitOfWork } = options;

  const userService = createUserService({
    userRepository: repositories.user,
    employmentRepository: repositories.employment,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    sessionRevocation: session.revocation,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditService: tx.auditService,
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
    })),
  });

  const positionService = createPositionService({
    positionRepository: repositories.position,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      positionRepository: tx.repositories.position,
      auditService: tx.auditService,
    })),
  });

  const employmentService = createEmploymentService({
    employmentRepository: repositories.employment,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    clock: runtime.clock,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      userRepository: tx.repositories.user,
      auditService: tx.auditService,
    })),
  });

  return {
    client: clientService,
    employment: employmentService,
    organization: organizationService,
    position: positionService,
    user: userService,
  };
}

export type AdminApiServices = ReturnType<typeof createAdminApiServices>;
