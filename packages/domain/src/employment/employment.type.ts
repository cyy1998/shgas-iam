import type { z } from "@hono/zod-openapi";
import type {
  EmploymentDetailDtoSchema,
  EmploymentDetailSchema,
  EmploymentDtoSchema,
  EmploymentSchema,
} from "./schema";

export type Employment = z.infer<typeof EmploymentSchema>;
export type EmploymentDetail = z.infer<typeof EmploymentDetailSchema>;
export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;
export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;
