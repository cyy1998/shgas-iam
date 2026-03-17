import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema';
import { StringNullableWithAggregatesFilterObjectSchema as StringNullableWithAggregatesFilterObjectSchema } from './StringNullableWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema'

const privilegedelegationscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  delegatorUserId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  delegateeUserId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  organizationScopeId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  startTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  endTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  status: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableWithAggregatesFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const PrivilegeDelegationScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationScalarWhereWithAggregatesInput> = privilegedelegationscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.PrivilegeDelegationScalarWhereWithAggregatesInput>;
export const PrivilegeDelegationScalarWhereWithAggregatesInputObjectZodSchema = privilegedelegationscalarwherewithaggregatesinputSchema;
