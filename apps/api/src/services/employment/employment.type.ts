import type { z } from "@hono/zod-openapi";
import type {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentCreateDtoSchema,
  EmploymentDetailDtoSchema,
  EmploymentDtoSchema,
  EmploymentPaginationQueryDtoSchema,
  EmploymentQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "./employment.schema";

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;
export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;
export type EmploymentQueryDto = z.infer<typeof EmploymentQueryDtoSchema>;
export type EmploymentPaginationQueryDto = z.infer<typeof EmploymentPaginationQueryDtoSchema>;
export type EmploymentCreateDto = z.infer<typeof EmploymentCreateDtoSchema>;
export type EmploymentAdminPaginationQueryDto = z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>;
export type EmploymentAdminCreateDto = z.infer<typeof EmploymentAdminCreateDtoSchema>;
export type EmploymentUpdateDto = z.infer<typeof EmploymentUpdateDtoSchema>;
export type EmploymentStatusUpdateDto = z.infer<typeof EmploymentStatusUpdateDtoSchema>;
export type EmploymentTransferDto = z.infer<typeof EmploymentTransferDtoSchema>;
