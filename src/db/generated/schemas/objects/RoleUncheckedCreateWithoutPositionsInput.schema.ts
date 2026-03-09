import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  roleCode: z.string(),
  roleName: z.string(),
  clientId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  organizations: z.lazy(() => OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional()
}).strict();
export const RoleUncheckedCreateWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleUncheckedCreateWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUncheckedCreateWithoutPositionsInput>;
export const RoleUncheckedCreateWithoutPositionsInputObjectZodSchema = makeSchema();
