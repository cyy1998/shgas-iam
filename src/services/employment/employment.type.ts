import type { z } from "@hono/zod-openapi";
import type { EmploymentDetailDtoSchema, EmploymentDtoSchema, EmploymentPaginationQueryDtoSchema, EmploymentQueryDtoSchema } from "./employment.schema";

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;
export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;
export type EmploymentQueryDto = z.infer<typeof EmploymentQueryDtoSchema>;
export type EmploymentPaginationQueryDto = z.infer<typeof EmploymentPaginationQueryDtoSchema>;
