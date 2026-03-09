import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { StringWithAggregatesFilterObjectSchema as StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema as StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema';
import { JsonWithAggregatesFilterObjectSchema as JsonWithAggregatesFilterObjectSchema } from './JsonWithAggregatesFilter.schema'

const clientscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => ClientScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => ClientScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => ClientScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => ClientScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => ClientScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  clientCode: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  clientName: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(128)]).optional(),
  url: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(128)]).optional().nullable(),
  status: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  extAttributes: z.lazy(() => JsonWithAggregatesFilterObjectSchema).optional()
}).strict();
export const ClientScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.ClientScalarWhereWithAggregatesInput> = clientscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.ClientScalarWhereWithAggregatesInput>;
export const ClientScalarWhereWithAggregatesInputObjectZodSchema = clientscalarwherewithaggregatesinputSchema;
