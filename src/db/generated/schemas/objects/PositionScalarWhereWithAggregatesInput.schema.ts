import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { StringWithAggregatesFilterObjectSchema as StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema as StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema'

const positionscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PositionScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PositionScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  posCode: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  posName: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(128)]).optional(),
  status: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const PositionScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.PositionScalarWhereWithAggregatesInput> = positionscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.PositionScalarWhereWithAggregatesInput>;
export const PositionScalarWhereWithAggregatesInputObjectZodSchema = positionscalarwherewithaggregatesinputSchema;
