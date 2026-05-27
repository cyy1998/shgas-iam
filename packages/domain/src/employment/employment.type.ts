import type { z } from "@hono/zod-openapi";
import type {
  EmploymentDetailDtoSchema,
  EmploymentDetailSchema,
  EmploymentDtoSchema,
  EmploymentOrganizationContextSchema,
  EmploymentOrgNodeSchema,
  EmploymentPositionSummarySchema,
  EmploymentSchema,
  EmploymentUserSummarySchema,
} from "./schema";

export type Employment = z.infer<typeof EmploymentSchema>;
export type EmploymentDetail = z.infer<typeof EmploymentDetailSchema>;
export type EmploymentUserSummary = z.infer<typeof EmploymentUserSummarySchema>;
export type EmploymentPositionSummary = z.infer<typeof EmploymentPositionSummarySchema>;
export type EmploymentOrgNode = z.infer<typeof EmploymentOrgNodeSchema>;
export type EmploymentOrganizationContext = z.infer<typeof EmploymentOrganizationContextSchema>;
export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;
export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>;
