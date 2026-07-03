import type { z } from "@hono/zod-openapi";
import type {
  RoleAssignmentDtoSchema,
  RoleAssignmentTargetSummaryDtoSchema,
  RoleClientSummaryDtoSchema,
  RoleDetailDtoSchema,
  RoleDtoSchema,
  RoleSchema,
} from "./schema";

export type Role = z.infer<typeof RoleSchema>;
export type RoleClientSummaryDto = z.infer<typeof RoleClientSummaryDtoSchema>;
export type RoleDto = z.infer<typeof RoleDtoSchema>;
export type RoleDetailDto = z.infer<typeof RoleDetailDtoSchema>;
export type RoleAssignmentTargetSummaryDto = z.infer<typeof RoleAssignmentTargetSummaryDtoSchema>;
export type RoleAssignmentDto = z.infer<typeof RoleAssignmentDtoSchema>;
