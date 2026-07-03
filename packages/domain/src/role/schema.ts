import { z } from "@hono/zod-openapi";
import { selectClientSchema, selectRoleAssignmentSchema, selectRoleSchema } from "@iam/db/schema";

const DbClientSchema = z.object(selectClientSchema.shape);
const DbRoleSchema = z.object(selectRoleSchema.shape);
const DbRoleAssignmentSchema = z.object(selectRoleAssignmentSchema.shape);

export const RoleClientSummaryDtoSchema = DbClientSchema.pick({
  id: true,
  clientCode: true,
  clientName: true,
  status: true,
}).openapi("RoleClientSummaryDto");

export const RoleSchema = DbRoleSchema.openapi("Role");

export const RoleDtoSchema = RoleSchema.extend({
  client: RoleClientSummaryDtoSchema,
  assignmentCount: z.number().int().nonnegative().default(0),
}).openapi("RoleDto");

export const RoleDetailDtoSchema = RoleDtoSchema.openapi("RoleDetailDto");

export const RoleAssignmentTargetSummaryDtoSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().min(1),
  name: z.string().min(1),
  status: z.number().int().nullable().default(null),
  description: z.string().nullable().default(null),
}).openapi("RoleAssignmentTargetSummaryDto");

export const RoleAssignmentDtoSchema = DbRoleAssignmentSchema.extend({
  target: RoleAssignmentTargetSummaryDtoSchema,
}).openapi("RoleAssignmentDto");

export function toRoleDto(input: unknown) {
  return RoleDtoSchema.parse(input);
}

export function toRoleDetailDto(input: unknown) {
  return RoleDetailDtoSchema.parse(input);
}

export function toRoleAssignmentDto(input: unknown) {
  return RoleAssignmentDtoSchema.parse(input);
}
