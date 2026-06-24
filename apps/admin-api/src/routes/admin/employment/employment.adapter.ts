import type { EmploymentService } from "@admin-api/services/employment/employment.service";
import type { EmploymentRouteHandler } from "./employment.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.service";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@admin-api/services/employment/employment.schema";
import { router } from "@iam/api-core/trpc";
import { EmploymentStatus } from "@iam/contracts";
import { z } from "zod";
import { toEmploymentDetailVo, toEmploymentVo } from "./employment.schema";

const idInput = z.object({ id: z.coerce.number().int().positive() });

export interface CreateEmploymentAdapterDeps {
  employmentService: Pick<
    EmploymentService,
    | "createEmploymentForAdmin"
    | "deleteEmployment"
    | "getEmploymentDetailByIdForAdmin"
    | "resignUser"
    | "searchEmploymentsFuzzyForAdmin"
    | "setPrimaryEmployment"
    | "transferEmployment"
    | "updateEmployment"
    | "updateEmploymentStatus"
  >;
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
    handler: (input, context) =>
      deps.employmentService.createEmploymentForAdmin(input, resolveAdminAuditContext(context)),
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

  const updateEmploymentStatus = defineAdminApiMutationOperation({
    input: z.object({
      id: z.coerce.number().int().positive(),
      status: z.enum(EmploymentStatus),
    }),
    restInput: c => ({
      id: (c.req.valid("param") as { id: number }).id,
      status: (c.req.valid("json") as { status: EmploymentStatus }).status,
    }),
    handler: ({ id, status }, context) =>
      deps.employmentService.updateEmploymentStatus(id, status, resolveAdminAuditContext(context)),
  });

  const deleteEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) =>
      deps.employmentService.deleteEmployment(id, resolveAdminAuditContext(context)),
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
    handler: ({ id, data }, context) =>
      deps.employmentService.transferEmployment(id, data, resolveAdminAuditContext(context)),
  });

  const setPrimaryEmployment = defineAdminApiMutationOperation({
    input: idInput,
    restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
    handler: ({ id }, context) =>
      deps.employmentService.setPrimaryEmployment(id, resolveAdminAuditContext(context)),
  });

  const resignUser = defineAdminApiMutationOperation({
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: ({ username }, context) =>
      deps.employmentService.resignUser(username, resolveAdminAuditContext(context)),
  });

  const employmentAdminRouter = router({
    search: searchEmployment.toTRPC(),
    detail: getEmployment.toTRPC(),
    create: createEmployment.toTRPC(),
    update: updateEmployment.toTRPC(),
    updateStatus: updateEmploymentStatus.toTRPC(),
    delete: deleteEmployment.toTRPC(),
    transfer: transferEmployment.toTRPC(),
    setPrimary: setPrimaryEmployment.toTRPC(),
    resignUser: resignUser.toTRPC(),
  });

  return {
    employmentAdminRouter,
    employmentsCreate: createEmployment.toHandler<EmploymentRouteHandler<"employmentsCreate">>(),
    employmentsDelete: deleteEmployment.toHandler<EmploymentRouteHandler<"employmentsDelete">>(),
    employmentsDetail: getEmployment.toHandler<EmploymentRouteHandler<"employmentsDetail">>(),
    employmentsResignUser: resignUser.toHandler<EmploymentRouteHandler<"employmentsResignUser">>(),
    employmentsSearch: searchEmployment.toHandler<EmploymentRouteHandler<"employmentsSearch">>(),
    employmentsSetPrimary: setPrimaryEmployment.toHandler<EmploymentRouteHandler<"employmentsSetPrimary">>(),
    employmentsStatusUpdate: updateEmploymentStatus.toHandler<EmploymentRouteHandler<"employmentsStatusUpdate">>(),
    employmentsTransfer: transferEmployment.toHandler<EmploymentRouteHandler<"employmentsTransfer">>(),
    employmentsUpdate: updateEmployment.toHandler<EmploymentRouteHandler<"employmentsUpdate">>(),
  };
}

export type EmploymentAdapter = ReturnType<typeof createEmploymentAdapter>;
