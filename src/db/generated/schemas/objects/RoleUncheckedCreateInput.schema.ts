import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  roleCode: z.string().max(64),
  roleName: z.string().max(128),
  clientId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  positions: z.lazy(() => PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional()
}).strict();
export const RoleUncheckedCreateInputObjectSchema: z.ZodType<Prisma.RoleUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUncheckedCreateInput>;
export const RoleUncheckedCreateInputObjectZodSchema = makeSchema();
