import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { EmploymentListRelationFilterObjectSchema as EmploymentListRelationFilterObjectSchema } from './EmploymentListRelationFilter.schema';
import { PositionRoleListRelationFilterObjectSchema as PositionRoleListRelationFilterObjectSchema } from './PositionRoleListRelationFilter.schema';
import { PosOrgCompositionListRelationFilterObjectSchema as PosOrgCompositionListRelationFilterObjectSchema } from './PosOrgCompositionListRelationFilter.schema'

const positionwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionWhereInputObjectSchema), z.lazy(() => PositionWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionWhereInputObjectSchema), z.lazy(() => PositionWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  posCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  posName: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(128)]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  employments: z.lazy(() => EmploymentListRelationFilterObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleListRelationFilterObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionListRelationFilterObjectSchema).optional()
}).strict();
export const PositionWhereInputObjectSchema: z.ZodType<Prisma.PositionWhereInput> = positionwhereinputSchema as unknown as z.ZodType<Prisma.PositionWhereInput>;
export const PositionWhereInputObjectZodSchema = positionwhereinputSchema;
