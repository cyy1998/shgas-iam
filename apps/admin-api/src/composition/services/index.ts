import type { AdminApiRepositories } from "../repositories";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiTxPorts, createAdminApiUnitOfWork } from "../tx";
import { createClientService } from "@admin-api/services/client/client.service";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createUserService } from "@admin-api/services/user/user.service";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiServicesOptions {
  runtime: AdminApiRuntimePorts;
  repositories: AdminApiRepositories;
  unitOfWork: AdminApiUnitOfWork;
}

function createMappedUnitOfWork<TxPort>(
  unitOfWork: AdminApiUnitOfWork,
  map: (tx: AdminApiTxPorts) => TxPort,
): { transaction: <T>(callback: (tx: TxPort) => Promise<T>) => Promise<T> } {
  return {
    async transaction(callback) {
      return await unitOfWork.transaction(async tx => await callback(map(tx)));
    },
  };
}

export function createAdminApiServices(options: CreateAdminApiServicesOptions) {
  const { runtime, repositories, unitOfWork } = options;

  const userService = createUserService({
    userRepository: repositories.user,
    employmentRepository: repositories.employment,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    tokenRevocation: runtime.integrations.tokenRevocation,
    uow: createMappedUnitOfWork(unitOfWork, tx => ({
      userRepository: tx.repositories.user,
      auditService: tx.auditService,
    })),
  });

  const clientService = createClientService({
    clientRepository: repositories.client,
    clientCache: runtime.integrations.clientCache,
    oidcInvalidation: runtime.integrations.oidcInvalidation,
    logger: runtime.logger,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    uow: createMappedUnitOfWork(unitOfWork, tx => ({
      clientRepository: tx.repositories.client,
      auditService: tx.auditService,
    })),
  });

  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: createMappedUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
      auditService: tx.auditService,
    })),
  });

  const positionService = createPositionService({
    positionRepository: repositories.position,
    uow: createMappedUnitOfWork(unitOfWork, tx => ({
      positionRepository: tx.repositories.position,
      auditService: tx.auditService,
    })),
  });

  const employmentService = createEmploymentService({
    employmentRepository: repositories.employment,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    clock: runtime.clock,
    uow: createMappedUnitOfWork(unitOfWork, tx => ({
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
