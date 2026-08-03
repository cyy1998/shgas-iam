import type {
  ResignUserSessionRevocationPort,
  ResignUserUseCaseDeps,
} from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { createAdminApiUnitOfWork } from "../tx";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";

type AdminApiUnitOfWork = ReturnType<typeof createAdminApiUnitOfWork>;

export interface CreateAdminApiUseCasesOptions {
  sessionRevocation: ResignUserSessionRevocationPort;
  subjectAccessLifecycle: ResignUserUseCaseDeps["subjectAccessLifecycle"];
  unitOfWork: AdminApiUnitOfWork;
  userReader: ResignUserUseCaseDeps["userReader"];
}

export function createAdminApiUseCases(options: CreateAdminApiUseCasesOptions) {
  const resignUser = createResignUserUseCase({
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
      resignUser,
    },
  };
}

export type AdminApiUseCases = ReturnType<typeof createAdminApiUseCases>;
