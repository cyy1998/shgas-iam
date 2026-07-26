import type { RoleService } from "@admin-api/services/role/role.service";
import type { RoleRouteHandler } from "./role.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import {
  RoleAssignmentCreateDtoSchema,
  RoleAssignmentPaginationQueryDtoSchema,
  RoleAssignmentScopeUpdateDtoSchema,
  RoleCreateDtoSchema,
  RolePaginationQueryDtoSchema,
  RoleStatusUpdateDtoSchema,
  RoleUpdateDtoSchema,
} from "@admin-api/services/role/role.schema";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";
import { toRoleAssignmentVo, toRoleDetailVo, toRoleVo } from "./role.schema";

export interface CreateRoleAdapterDeps {
  roleService: Pick<
    RoleService,
    | "createAssignment"
    | "createRole"
    | "deleteAssignment"
    | "deleteRole"
    | "getRoleDetailByCode"
    | "searchAssignments"
    | "searchRolesForAdmin"
    | "updateAssignmentScope"
    | "updateRole"
    | "updateRoleStatus"
  >;
}

export function createRoleAdapter(deps: CreateRoleAdapterDeps) {
  const searchRole = defineAdminApiQueryOperation({
    input: RolePaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof RolePaginationQueryDtoSchema>,
    handler: async (input) => {
      const { result, ...rest } = await deps.roleService.searchRolesForAdmin(input);
      return { result: result.map(row => toRoleVo(row)), ...rest };
    },
  });

  const getRole = defineAdminApiQueryOperation({
    input: z.object({ roleCode: z.string() }),
    restInput: c => c.req.valid("param") as { roleCode: string },
    handler: async ({ roleCode }) => toRoleDetailVo(await deps.roleService.getRoleDetailByCode(roleCode)),
  });

  const createRole = defineAdminApiMutationOperation({
    input: RoleCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof RoleCreateDtoSchema>,
    handler: async (input, context) =>
      toRoleDetailVo(await deps.roleService.createRole(input, resolveAdminAuditContext(context))),
  });

  const updateRole = defineAdminApiMutationOperation({
    input: z.object({
      roleCode: z.string(),
      data: RoleUpdateDtoSchema,
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      data: c.req.valid("json") as z.infer<typeof RoleUpdateDtoSchema>,
    }),
    handler: async ({ roleCode, data }, context) =>
      toRoleDetailVo(await deps.roleService.updateRole(roleCode, data, resolveAdminAuditContext(context))),
  });

  const updateRoleStatus = defineAdminApiMutationOperation({
    input: z.object({
      roleCode: z.string(),
      status: RoleStatusUpdateDtoSchema.shape.status,
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      status: (c.req.valid("json") as z.infer<typeof RoleStatusUpdateDtoSchema>).status,
    }),
    handler: async ({ roleCode, status }, context) =>
      toRoleDetailVo(await deps.roleService.updateRoleStatus(roleCode, status, resolveAdminAuditContext(context))),
  });

  const deleteRole = defineAdminApiMutationOperation({
    input: z.object({ roleCode: z.string() }),
    restInput: c => c.req.valid("param") as { roleCode: string },
    handler: ({ roleCode }, context) => deps.roleService.deleteRole(roleCode, resolveAdminAuditContext(context)),
  });

  const searchAssignment = defineAdminApiQueryOperation({
    input: z.object({
      roleCode: z.string(),
      query: RoleAssignmentPaginationQueryDtoSchema,
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      query: c.req.valid("json") as z.infer<typeof RoleAssignmentPaginationQueryDtoSchema>,
    }),
    handler: async ({ roleCode, query }) => {
      const { result, ...rest } = await deps.roleService.searchAssignments(roleCode, query);
      return { result: result.map(row => toRoleAssignmentVo(row)), ...rest };
    },
  });

  const createAssignment = defineAdminApiMutationOperation({
    input: z.object({
      roleCode: z.string(),
      data: RoleAssignmentCreateDtoSchema,
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      data: c.req.valid("json") as z.infer<typeof RoleAssignmentCreateDtoSchema>,
    }),
    handler: async ({ roleCode, data }, context) =>
      toRoleAssignmentVo(await deps.roleService.createAssignment(roleCode, data, resolveAdminAuditContext(context))),
  });

  const updateAssignmentScope = defineAdminApiMutationOperation({
    input: z.object({
      roleCode: z.string(),
      assignmentId: z.number().int().positive(),
      includeDescendants: RoleAssignmentScopeUpdateDtoSchema.shape.includeDescendants,
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      assignmentId: (c.req.valid("param") as { assignmentId: number }).assignmentId,
      includeDescendants: (c.req.valid("json") as z.infer<typeof RoleAssignmentScopeUpdateDtoSchema>)
        .includeDescendants,
    }),
    handler: async ({ roleCode, assignmentId, includeDescendants }, context) =>
      toRoleAssignmentVo(await deps.roleService.updateAssignmentScope(
        roleCode,
        assignmentId,
        includeDescendants,
        resolveAdminAuditContext(context),
      )),
  });

  const deleteAssignment = defineAdminApiMutationOperation({
    input: z.object({
      roleCode: z.string(),
      assignmentId: z.number().int().positive(),
    }),
    restInput: c => ({
      roleCode: (c.req.valid("param") as { roleCode: string }).roleCode,
      assignmentId: (c.req.valid("param") as { assignmentId: number }).assignmentId,
    }),
    handler: ({ roleCode, assignmentId }, context) =>
      deps.roleService.deleteAssignment(roleCode, assignmentId, resolveAdminAuditContext(context)),
  });

  const roleAdminRouter = router({
    search: searchRole.toTRPC(),
    detail: getRole.toTRPC(),
    create: createRole.toTRPC(),
    update: updateRole.toTRPC(),
    updateStatus: updateRoleStatus.toTRPC(),
    delete: deleteRole.toTRPC(),
    assignments: router({
      search: searchAssignment.toTRPC(),
      create: createAssignment.toTRPC(),
      updateScope: updateAssignmentScope.toTRPC(),
      delete: deleteAssignment.toTRPC(),
    }),
  });

  return {
    roleAdminRouter,
    roleAssignmentCreate: createAssignment.toHandler<RoleRouteHandler<"roleAssignmentCreate">>(),
    roleAssignmentDelete: deleteAssignment.toHandler<RoleRouteHandler<"roleAssignmentDelete">>(),
    roleAssignmentScopeUpdate: updateAssignmentScope.toHandler<RoleRouteHandler<"roleAssignmentScopeUpdate">>(),
    roleAssignmentsSearch: searchAssignment.toHandler<RoleRouteHandler<"roleAssignmentsSearch">>(),
    roleCreate: createRole.toHandler<RoleRouteHandler<"roleCreate">>(),
    roleDelete: deleteRole.toHandler<RoleRouteHandler<"roleDelete">>(),
    roleDetail: getRole.toHandler<RoleRouteHandler<"roleDetail">>(),
    rolesSearch: searchRole.toHandler<RoleRouteHandler<"rolesSearch">>(),
    roleStatusUpdate: updateRoleStatus.toHandler<RoleRouteHandler<"roleStatusUpdate">>(),
    roleUpdate: updateRole.toHandler<RoleRouteHandler<"roleUpdate">>(),
  };
}

export type RoleAdapter = ReturnType<typeof createRoleAdapter>;
