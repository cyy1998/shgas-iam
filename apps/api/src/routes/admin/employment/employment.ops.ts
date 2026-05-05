import { EmploymentStatus } from "@api/enums/employment.status";
import { defineMutationOp, defineQueryOp } from "@api/lib/core/business-op";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@api/services/employment/employment.schema";
import * as employmentService from "@api/services/employment/employment.service";
import { z } from "zod";
import { EmploymentDetailVoConverterSchema, EmploymentVoConverterSchema } from "./employment.schema";

export const searchEmploymentOp = defineQueryOp({
  input: EmploymentAdminPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await employmentService.searchEmploymentsFuzzyForAdmin(input);
    return {
      result: result.map(e => EmploymentVoConverterSchema.parse(e)),
      ...rest,
    };
  },
});

export const getEmploymentOp = defineQueryOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: async ({ id }) => {
    const detail = await employmentService.getEmploymentDetailByIdForAdmin(id);
    return EmploymentDetailVoConverterSchema.parse(detail);
  },
});

export const createEmploymentOp = defineMutationOp({
  input: EmploymentAdminCreateDtoSchema,
  handler: input => employmentService.createEmploymentForAdmin(input),
});

export const updateEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentUpdateDtoSchema,
  }),
  handler: ({ id, data }) => employmentService.updateEmployment(id, data),
});

export const updateEmploymentStatusOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    status: z.enum(EmploymentStatus),
  }),
  handler: ({ id, status }) => employmentService.updateEmploymentStatus(id, status),
});

export const deleteEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }) => employmentService.deleteEmployment(id),
});

export const transferEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentTransferDtoSchema,
  }),
  handler: ({ id, data }) => employmentService.transferEmployment(id, data),
});

export const setPrimaryEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }) => employmentService.setPrimaryEmployment(id),
});

export const resignUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => employmentService.resignUser(username),
});

// re-export for handler body schemas
export { EmploymentStatusUpdateDtoSchema };
