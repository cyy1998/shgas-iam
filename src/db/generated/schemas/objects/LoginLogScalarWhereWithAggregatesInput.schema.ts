import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { StringWithAggregatesFilterObjectSchema as StringWithAggregatesFilterObjectSchema } from './StringWithAggregatesFilter.schema';
import { DateTimeWithAggregatesFilterObjectSchema as DateTimeWithAggregatesFilterObjectSchema } from './DateTimeWithAggregatesFilter.schema'

const loginlogscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => LoginLogScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => LoginLogScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => LoginLogScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => LoginLogScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => LoginLogScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  userId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  username: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  name: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  clientCode: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  loginType: z.union([z.lazy(() => StringWithAggregatesFilterObjectSchema), z.string().max(64)]).optional(),
  loginTime: z.union([z.lazy(() => DateTimeWithAggregatesFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const LoginLogScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.LoginLogScalarWhereWithAggregatesInput> = loginlogscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.LoginLogScalarWhereWithAggregatesInput>;
export const LoginLogScalarWhereWithAggregatesInputObjectZodSchema = loginlogscalarwherewithaggregatesinputSchema;
