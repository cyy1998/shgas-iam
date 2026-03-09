import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema as StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema'

const posorgcompositionscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  posId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  orgId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  status: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const PosOrgCompositionScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionScalarWhereWithAggregatesInput> = posorgcompositionscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.PosOrgCompositionScalarWhereWithAggregatesInput>;
export const PosOrgCompositionScalarWhereWithAggregatesInputObjectZodSchema = posorgcompositionscalarwherewithaggregatesinputSchema;
