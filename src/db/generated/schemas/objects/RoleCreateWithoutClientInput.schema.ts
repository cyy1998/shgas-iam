import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateNestedManyWithoutRoleInputObjectSchema as PositionRoleCreateNestedManyWithoutRoleInputObjectSchema } from './PositionRoleCreateNestedManyWithoutRoleInput.schema';
import { OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema as OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema } from './OrganizationRoleCreateNestedManyWithoutRoleInput.schema';
import { PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema as PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutRoleInput.schema';
import { EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema as EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema } from './EmploymentRoleCreateNestedManyWithoutRoleInput.schema';
import { RolePrivilegeCreateNestedManyWithoutRoleInputObjectSchema as RolePrivilegeCreateNestedManyWithoutRoleInputObjectSchema } from './RolePrivilegeCreateNestedManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  roleCode: z.string().max(64),
  roleName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  positions: z.lazy(() => PositionRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeCreateNestedManyWithoutRoleInputObjectSchema).optional()
}).strict();
export const RoleCreateWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleCreateWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateWithoutClientInput>;
export const RoleCreateWithoutClientInputObjectZodSchema = makeSchema();
