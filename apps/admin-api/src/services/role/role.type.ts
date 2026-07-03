import type { z } from "@hono/zod-openapi";
import type {
  RoleAssignmentCreateDtoSchema,
  RoleAssignmentPaginationQueryDtoSchema,
  RoleAssignmentScopeUpdateDtoSchema,
  RoleCreateDtoSchema,
  RolePaginationQueryDtoSchema,
  RoleUpdateDtoSchema,
} from "./role.schema";

export type RolePaginationQueryDto = z.infer<typeof RolePaginationQueryDtoSchema>;
export type RoleCreateDto = z.infer<typeof RoleCreateDtoSchema>;
export type RoleUpdateDto = z.infer<typeof RoleUpdateDtoSchema>;
export type RoleAssignmentPaginationQueryDto = z.infer<typeof RoleAssignmentPaginationQueryDtoSchema>;
export type RoleAssignmentCreateDto = z.infer<typeof RoleAssignmentCreateDtoSchema>;
export type RoleAssignmentScopeUpdateDto = z.infer<typeof RoleAssignmentScopeUpdateDtoSchema>;
