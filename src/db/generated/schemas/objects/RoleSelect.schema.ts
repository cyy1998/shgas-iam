import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientArgsObjectSchema as ClientArgsObjectSchema } from './ClientArgs.schema';
import { PositionRoleFindManySchema as PositionRoleFindManySchema } from '../findManyPositionRole.schema';
import { OrganizationRoleFindManySchema as OrganizationRoleFindManySchema } from '../findManyOrganizationRole.schema';
import { PosOrgRoleFindManySchema as PosOrgRoleFindManySchema } from '../findManyPosOrgRole.schema';
import { EmploymentRoleFindManySchema as EmploymentRoleFindManySchema } from '../findManyEmploymentRole.schema';
import { RolePrivilegeFindManySchema as RolePrivilegeFindManySchema } from '../findManyRolePrivilege.schema';
import { RoleCountOutputTypeArgsObjectSchema as RoleCountOutputTypeArgsObjectSchema } from './RoleCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  roleCode: z.boolean().optional(),
  roleName: z.boolean().optional(),
  clientId: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  client: z.union([z.boolean(), z.lazy(() => ClientArgsObjectSchema)]).optional(),
  positions: z.union([z.boolean(), z.lazy(() => PositionRoleFindManySchema)]).optional(),
  organizations: z.union([z.boolean(), z.lazy(() => OrganizationRoleFindManySchema)]).optional(),
  positionOrganizations: z.union([z.boolean(), z.lazy(() => PosOrgRoleFindManySchema)]).optional(),
  employments: z.union([z.boolean(), z.lazy(() => EmploymentRoleFindManySchema)]).optional(),
  privileges: z.union([z.boolean(), z.lazy(() => RolePrivilegeFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => RoleCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const RoleSelectObjectSchema: z.ZodType<Prisma.RoleSelect> = makeSchema() as unknown as z.ZodType<Prisma.RoleSelect>;
export const RoleSelectObjectZodSchema = makeSchema();
