import type { ResignUserSessionRevocationPort } from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { createAdminApiUnitOfWork } from "../tx";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiUseCasesOptions {
  sessionRevocation: ResignUserSessionRevocationPort;
  unitOfWork: AdminApiUnitOfWork;
}

export function createAdminApiUseCases(options: CreateAdminApiUseCasesOptions) {
  const resignUser = createResignUserUseCase({
    sessionRevocation: options.sessionRevocation,
    uow: mapUnitOfWork(options.unitOfWork, tx => ({
      auditLogWriter: tx.auditService,
      employmentStore: tx.repositories.employment,
      profileDirtyMarker: tx.profileDirtyMarker,
      userStore: tx.repositories.user,
    })),
  });

  return {
    employment: {
      resignUser,
    },
  };
}

export type AdminApiUseCases = ReturnType<typeof createAdminApiUseCases>;
