import type { EmploymentService } from "@admin-api/services/employment/employment.service";
import type { ChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import type { CreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import type { EndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import type { ManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import type { ResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import type { TransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import type { EmploymentRouteHandler } from "./employment.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentResumeDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@admin-api/services/employment/employment.schema";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";
import { toEmploymentDetailVo, toEmploymentVo } from "./employment.schema";

const idInput = z.object({ id: z.coerce.number().int().positive() });

export interface CreateEmploymentAdapterDeps {
  changeEmploymentAvailability: Pick<ChangeEmploymentAvailabilityUseCase, "execute">;
  createEmployment: Pick<CreateEmploymentUseCase, "execute">;
  endEmployment: Pick<EndEmploymentUseCase, "execute">;
  employmentService: Pick<
    EmploymentService,
    | "getEmploymentDetailByIdForAdmin"
    | "searchEmploymentsFuzzyForAdmin"
    | "updateEmployment"
  >;
  managePrimaryEmployment: Pick<ManagePrimaryEmploymentUseCase, "execute">;
  resignUser: Pick<ResignUserUseCase, "execute">;
  transferEmployment: Pick<TransferEmploymentUseCase, "execute">;
}

export function createEmploymentAdapter(deps: CreateEmploymentAdapterDeps) {
  const searchEmployment = defineAdminApiQueryOperation({
    input: EmploymentAdminPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>,
    handler: async (input) => {
      const { result, ...rest } = await deps.employmentService.searchEmploymentsFuzzyForAdmin(input);
      return {
        result: result.map(e => toEmploymentVo(e)),
        ...rest,
      };
    },
  });

  const getEmployment = defineAdminApiQueryOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }) => {
      const detail = await deps.employmentService.getEmploymentDetailByIdForAdmin(id);
      return toEmploymentDetailVo(detail);
    },
  });

  const createEmployment = defineAdminApiMutationOperation({
    input: EmploymentAdminCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminCreateDtoSchema>,
    handler: (input, context) => deps.createEmployment.execute({
      username: input.username,
      orgCode: input.orgCode ?? input.deptOrgCode!,
      expectedAncestorOrgCode: input.expectedAncestorOrgCode ?? input.companyOrgCode,
      posCode: input.posCode,
      isPrimary: input.isPrimary,
      description: input.description,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const updateEmployment = defineAdminApiMutationOperation({
    input: z.object({
      id: z.coerce.number().int().positive(),
      data: EmploymentUpdateDtoSchema,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      data: c.req.valid("json") as z.infer<typeof EmploymentUpdateDtoSchema>,
    }),
    handler: ({ id, data }, context) =>
      deps.employmentService.updateEmployment(id, data, resolveAdminAuditContext(context)),
  });

  const pauseEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) => deps.changeEmploymentAvailability.execute({
      command: "pause",
      employmentId: id,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const resumeEmployment = defineAdminApiMutationOperation({
    input: z.object({
      id: z.coerce.number().int().positive(),
      expectedAncestorOrgCode: EmploymentResumeDtoSchema.shape.expectedAncestorOrgCode,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      expectedAncestorOrgCode: (c.req.valid("json") as z.infer<typeof EmploymentResumeDtoSchema>)
        .expectedAncestorOrgCode,
    }),
    handler: ({ id, expectedAncestorOrgCode }, context) =>
      deps.changeEmploymentAvailability.execute({
        command: "resume",
        employmentId: id,
        expectedAncestorOrgCode,
      }, {
        auditContext: resolveAdminAuditContext(context),
      }),
  });

  const endEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) => deps.endEmployment.execute({
      employmentId: id,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const transferEmployment = defineAdminApiMutationOperation({
    input: z.object({
      id: z.coerce.number().int().positive(),
      data: EmploymentTransferDtoSchema,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      data: c.req.valid("json") as z.infer<typeof EmploymentTransferDtoSchema>,
    }),
    handler: ({ id, data }, context) => deps.transferEmployment.execute({
      employmentId: id,
      newOrgCode: data.newOrgCode,
      expectedAncestorOrgCode: data.expectedAncestorOrgCode,
      newPosCode: data.newPosCode,
      isPrimary: data.isPrimary,
      description: data.description,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const setPrimaryEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) => deps.managePrimaryEmployment.execute({
      command: "set",
      employmentId: id,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const clearPrimaryEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) => deps.managePrimaryEmployment.execute({
      command: "clear",
      employmentId: id,
    }, {
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const resignUser = defineAdminApiMutationOperation({
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: ({ username }, context) =>
      deps.resignUser.execute(
        { username },
        { auditContext: resolveAdminAuditContext(context) },
      ),
  });

  const employmentAdminRouter = router({
    search: searchEmployment.toTRPC(),
    detail: getEmployment.toTRPC(),
    create: createEmployment.toTRPC(),
    end: endEmployment.toTRPC(),
    update: updateEmployment.toTRPC(),
    pause: pauseEmployment.toTRPC(),
    resume: resumeEmployment.toTRPC(),
    transfer: transferEmployment.toTRPC(),
    setPrimary: setPrimaryEmployment.toTRPC(),
    clearPrimary: clearPrimaryEmployment.toTRPC(),
    resignUser: resignUser.toTRPC(),
  });

  return {
    employmentAdminRouter,
    employmentsCreate: createEmployment.toHandler<EmploymentRouteHandler<"employmentsCreate">>(),
    employmentsDetail: getEmployment.toHandler<EmploymentRouteHandler<"employmentsDetail">>(),
    employmentsEnd: endEmployment.toHandler<EmploymentRouteHandler<"employmentsEnd">>(),
    employmentsPause: pauseEmployment.toHandler<EmploymentRouteHandler<"employmentsPause">>(),
    employmentsResume: resumeEmployment.toHandler<EmploymentRouteHandler<"employmentsResume">>(),
    employmentsResignUser: resignUser.toHandler<EmploymentRouteHandler<"employmentsResignUser">>(),
    employmentsSearch: searchEmployment.toHandler<EmploymentRouteHandler<"employmentsSearch">>(),
    employmentsClearPrimary: clearPrimaryEmployment.toHandler<EmploymentRouteHandler<"employmentsClearPrimary">>(),
    employmentsSetPrimary: setPrimaryEmployment.toHandler<EmploymentRouteHandler<"employmentsSetPrimary">>(),
    employmentsTransfer: transferEmployment.toHandler<EmploymentRouteHandler<"employmentsTransfer">>(),
    employmentsUpdate: updateEmployment.toHandler<EmploymentRouteHandler<"employmentsUpdate">>(),
  };
}

export type EmploymentAdapter = ReturnType<typeof createEmploymentAdapter>;
