import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createApiUnitOfWork } from "../tx";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiUseCasesOptions {
  auditLogWriter: ApiAuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  unitOfWork: ApiUnitOfWork;
}

export function createApiUseCases(options: CreateApiUseCasesOptions) {
  const { auditLogWriter, runtime, services, unitOfWork } = options;

  const registerPurveyorContact = createRegisterPurveyorContactUseCase({
    auditLogWriter,
    config: {
      nodeEnv: runtime.config.env.nodeEnv,
    },
    mobileService: services.mobile,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      userRepository: tx.repositories.user,
      profileDirtyMarker: tx.profileDirtyMarker,
    })),
  });

  return { registerPurveyorContact };
}

export type ApiUseCases = ReturnType<typeof createApiUseCases>;
