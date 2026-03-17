import type { z } from "@hono/zod-openapi";
import type { EmploymentDetailDtoSchema, EmploymentDtoSchema } from "./employment.schema";

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;
export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;
