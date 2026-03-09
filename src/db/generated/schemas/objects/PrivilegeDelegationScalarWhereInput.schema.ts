import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema'

const privilegedelegationscalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  delegatorUserId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  delegateeUserId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  organizationScopeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  startTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  endTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string()]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const PrivilegeDelegationScalarWhereInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationScalarWhereInput> = privilegedelegationscalarwhereinputSchema as unknown as z.ZodType<Prisma.PrivilegeDelegationScalarWhereInput>;
export const PrivilegeDelegationScalarWhereInputObjectZodSchema = privilegedelegationscalarwhereinputSchema;
