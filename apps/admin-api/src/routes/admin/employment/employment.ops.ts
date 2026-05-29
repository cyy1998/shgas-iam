import * as auditService from "@admin-api/services/audit/audit.service";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@admin-api/services/employment/employment.schema";
import * as employmentService from "@admin-api/services/employment/employment.service";
import { defineMutationOp, defineQueryOp } from "@iam/api-core/core/business-op";
import { EmploymentStatus } from "@iam/contracts";
import { z } from "zod";
import { toEmploymentDetailVo, toEmploymentVo } from "./employment.schema";

export const searchEmploymentOp = defineQueryOp({
  input: EmploymentAdminPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await employmentService.searchEmploymentsFuzzyForAdmin(input);
    return {
      result: result.map(e => toEmploymentVo(e)),
      ...rest,
    };
  },
});

export const getEmploymentOp = defineQueryOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: async ({ id }) => {
    const detail = await employmentService.getEmploymentDetailByIdForAdmin(id);
    return toEmploymentDetailVo(detail);
  },
});

export const createEmploymentOp = defineMutationOp({
  input: EmploymentAdminCreateDtoSchema,
  handler: (input, context) =>
    employmentService.createEmploymentForAdmin(input, auditService.resolveAdminAuditContext(context)),
});

export const updateEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentUpdateDtoSchema,
  }),
  handler: ({ id, data }, context) =>
    employmentService.updateEmployment(id, data, auditService.resolveAdminAuditContext(context)),
});

export const updateEmploymentStatusOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    status: z.enum(EmploymentStatus),
  }),
  handler: ({ id, status }, context) =>
    employmentService.updateEmploymentStatus(id, status, auditService.resolveAdminAuditContext(context)),
});

export const deleteEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }, context) =>
    employmentService.deleteEmployment(id, auditService.resolveAdminAuditContext(context)),
});

export const transferEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentTransferDtoSchema,
  }),
  handler: ({ id, data }, context) =>
    employmentService.transferEmployment(id, data, auditService.resolveAdminAuditContext(context)),
});

export const setPrimaryEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }, context) =>
    employmentService.setPrimaryEmployment(id, auditService.resolveAdminAuditContext(context)),
});

export const resignUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }, context) =>
    employmentService.resignUser(username, auditService.resolveAdminAuditContext(context)),
});

// re-export for handler body schemas
export { EmploymentStatusUpdateDtoSchema };
