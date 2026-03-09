import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema'

const rolescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => RoleScalarWhereInputObjectSchema), z.lazy(() => RoleScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RoleScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RoleScalarWhereInputObjectSchema), z.lazy(() => RoleScalarWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  roleName: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  clientId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string()]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const RoleScalarWhereInputObjectSchema: z.ZodType<Prisma.RoleScalarWhereInput> = rolescalarwhereinputSchema as unknown as z.ZodType<Prisma.RoleScalarWhereInput>;
export const RoleScalarWhereInputObjectZodSchema = rolescalarwhereinputSchema;
