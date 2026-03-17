import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientCreateNestedOneWithoutRolesInputObjectSchema as ClientCreateNestedOneWithoutRolesInputObjectSchema } from './ClientCreateNestedOneWithoutRolesInput.schema';
import { PositionRoleCreateNestedManyWithoutRoleInputObjectSchema as PositionRoleCreateNestedManyWithoutRoleInputObjectSchema } from './PositionRoleCreateNestedManyWithoutRoleInput.schema';
import { OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema as OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema } from './OrganizationRoleCreateNestedManyWithoutRoleInput.schema';
import { PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema as PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutRoleInput.schema';
import { EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema as EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema } from './EmploymentRoleCreateNestedManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  roleCode: z.string().max(64),
  roleName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  client: z.lazy(() => ClientCreateNestedOneWithoutRolesInputObjectSchema),
  positions: z.lazy(() => PositionRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleCreateNestedManyWithoutRoleInputObjectSchema).optional()
}).strict();
export const RoleCreateWithoutPrivilegesInputObjectSchema: z.ZodType<Prisma.RoleCreateWithoutPrivilegesInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateWithoutPrivilegesInput>;
export const RoleCreateWithoutPrivilegesInputObjectZodSchema = makeSchema();
