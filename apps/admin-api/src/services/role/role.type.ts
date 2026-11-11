import type { z } from "@hono/zod-openapi";
import type { RoleAssignmentTargetType, RoleKind, RoleStatus, RoleType } from "@iam/contracts";
import type { RoleAssignmentDto } from "@iam/domain/role";
import type {
  RoleAssignmentCreateDtoSchema,
  RoleAssignmentPaginationQueryDtoSchema,
  RoleAssignmentScopeUpdateDtoSchema,
  RoleCreateDtoSchema,
  RoleInclusionEndpointDtoSchema,
  RolePaginationQueryDtoSchema,
  RoleUpdateDtoSchema,
} from "./role.schema";

export type RolePaginationQueryDto = z.infer<typeof RolePaginationQueryDtoSchema>;
export type RoleCreateDto = z.infer<typeof RoleCreateDtoSchema>;
export type RoleUpdateDto = z.infer<typeof RoleUpdateDtoSchema>;
export type RoleProfileUpdateDto = Omit<RoleUpdateDto, "inclusions">;
export type RoleInclusionPatch = NonNullable<RoleUpdateDto["inclusions"]>;
export type RoleInclusionEndpointDto = z.infer<typeof RoleInclusionEndpointDtoSchema>;
export type RoleAssignmentPaginationQueryDto = z.infer<typeof RoleAssignmentPaginationQueryDtoSchema>;
export type RoleAssignmentCreateDto = z.infer<typeof RoleAssignmentCreateDtoSchema>;
export type RoleAssignmentScopeUpdateDto = z.infer<typeof RoleAssignmentScopeUpdateDtoSchema>;

export type {
  Role,
  RoleAssignmentDto,
  RoleAssignmentTargetSummaryDto,
  RoleClientSummaryDto,
  RoleDetailDto,
} from "@iam/domain/role";

export type AdminRoleAssignmentRecord = Omit<RoleAssignmentDto, "target">;

export interface AdminRoleCreateRecord {
  roleCode: string;
  roleName: string;
  roleKind: RoleKind;
  roleType: RoleType;
  clientId: number | null;
  status?: RoleStatus;
  description?: string | null;
}

export interface AdminRoleAssignmentCreateRecord {
  roleId: number;
  targetType: RoleAssignmentTargetType;
  targetId: number;
  includeDescendants: boolean;
}
