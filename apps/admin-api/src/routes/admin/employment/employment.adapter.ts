import type { AdminOperationId } from "@admin-api/services/admin-authorization/admin-operation.registry";
import type { EmploymentService } from "@admin-api/services/employment/employment.service";
import type { ChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import type { CreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import type { EndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import type { ManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import type { ResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import type { TransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import type { EmploymentRouteHandler } from "./employment.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import {
  authorizeAdminOperationForContext,
  getAdminAuthorizationContext,
  resolveAdminUserAuthorizationForContext,
} from "@admin-api/services/admin-authorization/admin-authorization.context";
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
    | "guardEmploymentMutationForAdmin"
    | "searchEmploymentsFuzzyForAdmin"
    | "updateEmployment"
  >;
  managePrimaryEmployment: Pick<ManagePrimaryEmploymentUseCase, "execute">;
  resignUser: Pick<ResignUserUseCase, "execute">;
  transferEmployment: Pick<TransferEmploymentUseCase, "execute">;
}

export function createEmploymentAdapter(deps: CreateEmploymentAdapterDeps) {
  async function resolveEmploymentAuthorization(
    hono: Parameters<typeof getAdminAuthorizationContext>[0],
    operationId: AdminOperationId,
  ) {
    const { actor, policy } = getAdminAuthorizationContext(hono);
    const operationAuthorization = await authorizeAdminOperationForContext(hono, {
      operationId,
      operationInput: undefined,
    });
    return await policy.getEmploymentAuthorization(
      actor,
      operationAuthorization.hrAdministrationScope,
    );
  }

  async function guardScopedEmploymentMutation(
    hono: Parameters<typeof getAdminAuthorizationContext>[0],
    id: number,
    operationId: Parameters<EmploymentService["guardEmploymentMutationForAdmin"]>[1],
  ) {
    const authorization = await resolveEmploymentAuthorization(hono, operationId);
    if (authorization.kind === "scoped") {
      await deps.employmentService.guardEmploymentMutationForAdmin(
        id,
        operationId,
        authorization,
      );
    }
    return authorization;
  }

  const searchEmployment = defineAdminApiQueryOperation({
    operationId: "admin.employment.search",
    input: EmploymentAdminPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>,
    handler: async (input, context) => {
      const { result, ...rest } = await deps.employmentService.searchEmploymentsFuzzyForAdmin(
        input,
        await resolveEmploymentAuthorization(context.hono, "admin.employment.search"),
      );
      return {
        result: result.map(e => toEmploymentVo(e)),
        ...rest,
      };
    },
  });

  const getEmployment = defineAdminApiQueryOperation({
    operationId: "admin.employment.detail",
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }, context) => {
      const authorization = await resolveEmploymentAuthorization(
        context.hono,
        "admin.employment.detail",
      );
      const detail = await deps.employmentService.getEmploymentDetailByIdForAdmin(id, authorization);
      return toEmploymentDetailVo(
        detail,
        authorization.getAllowedActions({ status: detail.status, isPrimary: detail.isPrimary }),
      );
    },
  });

  const createEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.create",
    input: EmploymentAdminCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminCreateDtoSchema>,
    handler: async (input, context) => deps.createEmployment.execute({
      username: input.username,
      orgCode: input.orgCode ?? input.deptOrgCode!,
      expectedAncestorOrgCode: input.expectedAncestorOrgCode ?? input.companyOrgCode,
      posCode: input.posCode,
      isPrimary: input.isPrimary,
      description: input.description,
    }, {
      authorization: await resolveEmploymentAuthorization(
        context.hono,
        "admin.employment.create",
      ),
      auditContext: resolveAdminAuditContext(context),
    }),
  });

  const updateEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.update",
    input: z.object({
      id: z.coerce.number().int().positive(),
      data: EmploymentUpdateDtoSchema,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      data: c.req.valid("json") as z.infer<typeof EmploymentUpdateDtoSchema>,
    }),
    handler: async ({ id, data }, context) =>
      deps.employmentService.updateEmployment(
        id,
        data,
        resolveAdminAuditContext(context),
        await resolveEmploymentAuthorization(context.hono, "admin.employment.update"),
      ),
  });

  const pauseEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.pause",
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }, context) => {
      await guardScopedEmploymentMutation(context.hono, id, "admin.employment.pause");
      return deps.changeEmploymentAvailability.execute({
        command: "pause",
        employmentId: id,
      }, {
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const resumeEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.resume",
    input: z.object({
      id: z.coerce.number().int().positive(),
      expectedAncestorOrgCode: EmploymentResumeDtoSchema.shape.expectedAncestorOrgCode,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      expectedAncestorOrgCode: (c.req.valid("json") as z.infer<typeof EmploymentResumeDtoSchema>)
        .expectedAncestorOrgCode,
    }),
    handler: async ({ id, expectedAncestorOrgCode }, context) => {
      await guardScopedEmploymentMutation(context.hono, id, "admin.employment.resume");
      return deps.changeEmploymentAvailability.execute({
        command: "resume",
        employmentId: id,
        expectedAncestorOrgCode,
      }, {
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const endEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.end",
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }, context) => {
      await guardScopedEmploymentMutation(context.hono, id, "admin.employment.end");
      return deps.endEmployment.execute({
        employmentId: id,
      }, {
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const transferEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.transfer",
    input: z.object({
      id: z.coerce.number().int().positive(),
      data: EmploymentTransferDtoSchema,
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      data: c.req.valid("json") as z.infer<typeof EmploymentTransferDtoSchema>,
    }),
    handler: async ({ id, data }, context) => {
      const authorization = await guardScopedEmploymentMutation(
        context.hono,
        id,
        "admin.employment.transfer",
      );
      return deps.transferEmployment.execute({
        employmentId: id,
        newOrgCode: data.newOrgCode,
        expectedAncestorOrgCode: data.expectedAncestorOrgCode,
        newPosCode: data.newPosCode,
        isPrimary: data.isPrimary,
        description: data.description,
      }, {
        authorization,
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const setPrimaryEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.setPrimary",
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }, context) => {
      await guardScopedEmploymentMutation(context.hono, id, "admin.employment.setPrimary");
      return deps.managePrimaryEmployment.execute({
        command: "set",
        employmentId: id,
      }, {
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const clearPrimaryEmployment = defineAdminApiMutationOperation({
    operationId: "admin.employment.clearPrimary",
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: async ({ id }, context) => {
      await guardScopedEmploymentMutation(context.hono, id, "admin.employment.clearPrimary");
      return deps.managePrimaryEmployment.execute({
        command: "clear",
        employmentId: id,
      }, {
        auditContext: resolveAdminAuditContext(context),
      });
    },
  });

  const resignUser = defineAdminApiMutationOperation({
    operationId: "admin.employment.resignUser",
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: async ({ username }, context) =>
      deps.resignUser.execute(
        { username },
        {
          auditContext: resolveAdminAuditContext(context),
          authorization: await resolveAdminUserAuthorizationForContext(
            context.hono,
            "admin.employment.resignUser",
          ),
        },
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
