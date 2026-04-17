import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema'

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
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const PosOrgCompositionWhereInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionWhereInput> = posorgcompositionwhereinputSchema as unknown as z.ZodType<Prisma.PosOrgCompositionWhereInput>;
export const PosOrgCompositionWhereInputObjectZodSchema = posorgcompositionwhereinputSchema;
