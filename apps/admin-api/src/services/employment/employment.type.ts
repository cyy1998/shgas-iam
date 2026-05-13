import type { z } from "@hono/zod-openapi";
import type {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "./employment.schema";

export type EmploymentAdminPaginationQueryDto = z.infer<typeof EmploymentAdminPaginationQueryDtoSchema>;
export type EmploymentAdminCreateDto = z.infer<typeof EmploymentAdminCreateDtoSchema>;
export type EmploymentUpdateDto = z.infer<typeof EmploymentUpdateDtoSchema>;
export type EmploymentTransferDto = z.infer<typeof EmploymentTransferDtoSchema>;
