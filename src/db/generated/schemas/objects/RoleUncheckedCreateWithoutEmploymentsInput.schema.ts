import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateNestedManyWithoutRoleInput.schema';
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
  positions: z.lazy(() => PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeUncheckedCreateNestedManyWithoutRoleInputObjectSchema).optional()
}).strict();
export const RoleUncheckedCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.RoleUncheckedCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUncheckedCreateWithoutEmploymentsInput>;
export const RoleUncheckedCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
