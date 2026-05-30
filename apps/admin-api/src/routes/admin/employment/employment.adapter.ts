import type { EmploymentRouteHandler } from "./employment.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@admin-api/services/employment/employment.schema";
import * as employmentService from "@admin-api/services/employment/employment.service";
import { router } from "@iam/api-core/trpc";
import { EmploymentStatus } from "@iam/contracts";
import { z } from "zod";
import { toEmploymentDetailVo, toEmploymentVo } from "./employment.schema";

const idInput = z.object({ id: z.coerce.number().int().positive() });

const searchEmployment = defineAdminApiQueryOperation({
  input: EmploymentAdminPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>,
  handler: async (input) => {
    const { result, ...rest } = await employmentService.searchEmploymentsFuzzyForAdmin(input);
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
    const detail = await employmentService.getEmploymentDetailByIdForAdmin(id);
    return toEmploymentDetailVo(detail);
  },
});

const createEmployment = defineAdminApiMutationOperation({
  input: EmploymentAdminCreateDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof EmploymentAdminCreateDtoSchema>,
  handler: (input, context) =>
    employmentService.createEmploymentForAdmin(input, auditService.resolveAdminAuditContext(context)),
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
    employmentService.updateEmployment(id, data, auditService.resolveAdminAuditContext(context)),
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
    employmentService.updateEmploymentStatus(id, status, auditService.resolveAdminAuditContext(context)),
});

const deleteEmployment = defineAdminApiMutationOperation({
  input: idInput,
  restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
  handler: ({ id }, context) =>
    employmentService.deleteEmployment(id, auditService.resolveAdminAuditContext(context)),
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
    employmentService.transferEmployment(id, data, auditService.resolveAdminAuditContext(context)),
});

const setPrimaryEmployment = defineAdminApiMutationOperation({
  input: idInput,
  restInput: c => c.req.valid("param") as z.infer<typeof idInput>,
  handler: ({ id }, context) =>
    employmentService.setPrimaryEmployment(id, auditService.resolveAdminAuditContext(context)),
});

const resignUser = defineAdminApiMutationOperation({
  input: z.object({ username: z.string() }),
  restInput: c => c.req.valid("param") as { username: string },
  handler: ({ username }, context) =>
    employmentService.resignUser(username, auditService.resolveAdminAuditContext(context)),
});

export const employmentsSearch = searchEmployment.toHandler<EmploymentRouteHandler<"employmentsSearch">>();
export const employmentsDetail = getEmployment.toHandler<EmploymentRouteHandler<"employmentsDetail">>();
export const employmentsCreate = createEmployment.toHandler<EmploymentRouteHandler<"employmentsCreate">>();
export const employmentsUpdate = updateEmployment.toHandler<EmploymentRouteHandler<"employmentsUpdate">>();
export const employmentsStatusUpdate
  = updateEmploymentStatus.toHandler<EmploymentRouteHandler<"employmentsStatusUpdate">>();
export const employmentsDelete = deleteEmployment.toHandler<EmploymentRouteHandler<"employmentsDelete">>();
export const employmentsTransfer = transferEmployment.toHandler<EmploymentRouteHandler<"employmentsTransfer">>();
export const employmentsSetPrimary
  = setPrimaryEmployment.toHandler<EmploymentRouteHandler<"employmentsSetPrimary">>();
export const employmentsResignUser = resignUser.toHandler<EmploymentRouteHandler<"employmentsResignUser">>();

export const employmentAdminRouter = router({
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
