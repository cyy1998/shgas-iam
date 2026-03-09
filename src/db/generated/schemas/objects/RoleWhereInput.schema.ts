import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { ClientScalarRelationFilterObjectSchema as ClientScalarRelationFilterObjectSchema } from './ClientScalarRelationFilter.schema';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './ClientWhereInput.schema';
import { PositionRoleListRelationFilterObjectSchema as PositionRoleListRelationFilterObjectSchema } from './PositionRoleListRelationFilter.schema';
import { OrganizationRoleListRelationFilterObjectSchema as OrganizationRoleListRelationFilterObjectSchema } from './OrganizationRoleListRelationFilter.schema';
import { PosOrgRoleListRelationFilterObjectSchema as PosOrgRoleListRelationFilterObjectSchema } from './PosOrgRoleListRelationFilter.schema';
import { EmploymentRoleListRelationFilterObjectSchema as EmploymentRoleListRelationFilterObjectSchema } from './EmploymentRoleListRelationFilter.schema';
import { RolePrivilegeListRelationFilterObjectSchema as RolePrivilegeListRelationFilterObjectSchema } from './RolePrivilegeListRelationFilter.schema'

const rolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => RoleWhereInputObjectSchema), z.lazy(() => RoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RoleWhereInputObjectSchema), z.lazy(() => RoleWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  roleName: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(128)]).optional(),
  clientId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  client: z.union([z.lazy(() => ClientScalarRelationFilterObjectSchema), z.lazy(() => ClientWhereInputObjectSchema)]).optional(),
  positions: z.lazy(() => PositionRoleListRelationFilterObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleListRelationFilterObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleListRelationFilterObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleListRelationFilterObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeListRelationFilterObjectSchema).optional()
}).strict();
export const RoleWhereInputObjectSchema: z.ZodType<Prisma.RoleWhereInput> = rolewhereinputSchema as unknown as z.ZodType<Prisma.RoleWhereInput>;
export const RoleWhereInputObjectZodSchema = rolewhereinputSchema;
