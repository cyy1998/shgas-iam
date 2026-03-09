import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { PositionScalarRelationFilterObjectSchema as PositionScalarRelationFilterObjectSchema } from './PositionScalarRelationFilter.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { OrganizationScalarRelationFilterObjectSchema as OrganizationScalarRelationFilterObjectSchema } from './OrganizationScalarRelationFilter.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { EmploymentListRelationFilterObjectSchema as EmploymentListRelationFilterObjectSchema } from './EmploymentListRelationFilter.schema';
import { PosOrgRoleListRelationFilterObjectSchema as PosOrgRoleListRelationFilterObjectSchema } from './PosOrgRoleListRelationFilter.schema'

const posorgcompositionwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgCompositionWhereInputObjectSchema), z.lazy(() => PosOrgCompositionWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgCompositionWhereInputObjectSchema), z.lazy(() => PosOrgCompositionWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  posId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  position: z.union([z.lazy(() => PositionScalarRelationFilterObjectSchema), z.lazy(() => PositionWhereInputObjectSchema)]).optional(),
  organization: z.union([z.lazy(() => OrganizationScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  employments: z.lazy(() => EmploymentListRelationFilterObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleListRelationFilterObjectSchema).optional()
}).strict();
export const PosOrgCompositionWhereInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionWhereInput> = posorgcompositionwhereinputSchema as unknown as z.ZodType<Prisma.PosOrgCompositionWhereInput>;
export const PosOrgCompositionWhereInputObjectZodSchema = posorgcompositionwhereinputSchema;
