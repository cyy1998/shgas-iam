import type { CreateEmploymentClockPort } from "@admin-api/use-cases/employment/create-employment/create-employment.port";
import type {
  ResignUserSessionRevocationPort,
  ResignUserUseCaseDeps,
} from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { createAdminApiUnitOfWork } from "../tx";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiUseCasesOptions {
  clock: CreateEmploymentClockPort;
  sessionRevocation: ResignUserSessionRevocationPort;
  subjectAccessLifecycle: ResignUserUseCaseDeps["subjectAccessLifecycle"];
  unitOfWork: AdminApiUnitOfWork;
  userReader: ResignUserUseCaseDeps["userReader"];
}

export function createAdminApiUseCases(options: CreateAdminApiUseCasesOptions) {
  const changeEmploymentAvailability = createChangeEmploymentAvailabilityUseCase({
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const createEmployment = createCreateEmploymentUseCase({
    clock: options.clock,
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const endEmployment = createEndEmploymentUseCase({
    clock: options.clock,
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const managePrimaryEmployment = createManagePrimaryEmploymentUseCase({
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const transferEmployment = createTransferEmploymentUseCase({
    clock: options.clock,
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });

  const resignUser = createResignUserUseCase({
    clock: options.clock,
    sessionRevocation: options.sessionRevocation,
    subjectAccessLifecycle: options.subjectAccessLifecycle,
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      auditLogWriter: tx.auditService,
      employmentStore: tx.repositories.employment,
      subjectAccessMutation: tx.subjectAccessMutation,
      userProfileInvalidation: tx.userProfileInvalidation,
      userStore: tx.repositories.user,
    })),
    userReader: options.userReader,
  });

  return {
    employment: {
      changeEmploymentAvailability,
      createEmployment,
      endEmployment,
      managePrimaryEmployment,
      resignUser,
      transferEmployment,
    },
  };
}

export type AdminApiUseCases = ReturnType<typeof createAdminApiUseCases>;
