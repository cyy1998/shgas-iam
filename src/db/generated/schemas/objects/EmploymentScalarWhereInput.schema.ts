import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { DateTimeNullableFilterObjectSchema as DateTimeNullableFilterObjectSchema } from './DateTimeNullableFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema'

const employmentscalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  userId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  posId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  compId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isPrimary: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  startTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  endTime: z.union([z.lazy(() => DateTimeNullableFilterObjectSchema), z.coerce.date()]).optional().nullable(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string()]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const EmploymentScalarWhereInputObjectSchema: z.ZodType<Prisma.EmploymentScalarWhereInput> = employmentscalarwhereinputSchema as unknown as z.ZodType<Prisma.EmploymentScalarWhereInput>;
export const EmploymentScalarWhereInputObjectZodSchema = employmentscalarwhereinputSchema;
