import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { StringWithAggregatesFilterObjectSchema as StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema as StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema'

const rolescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => RoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => RoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RoleScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => RoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  roleCode: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  roleName: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(128)]).optional(),
  clientId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  status: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const RoleScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.RoleScalarWhereWithAggregatesInput> = rolescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.RoleScalarWhereWithAggregatesInput>;
export const RoleScalarWhereWithAggregatesInputObjectZodSchema = rolescalarwherewithaggregatesinputSchema;
