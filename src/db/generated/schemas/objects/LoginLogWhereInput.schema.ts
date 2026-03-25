import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema'

const loginlogwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => LoginLogWhereInputObjectSchema), z.lazy(() => LoginLogWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => LoginLogWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => LoginLogWhereInputObjectSchema), z.lazy(() => LoginLogWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  userId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  username: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  name: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  clientCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  loginType: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  loginTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const LoginLogWhereInputObjectSchema: z.ZodType<Prisma.LoginLogWhereInput> = loginlogwhereinputSchema as unknown as z.ZodType<Prisma.LoginLogWhereInput>;
export const LoginLogWhereInputObjectZodSchema = loginlogwhereinputSchema;
