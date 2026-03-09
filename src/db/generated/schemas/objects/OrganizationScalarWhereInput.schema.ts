import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { IntNullableFilterObjectSchema as IntNullableFilterObjectSchema } from './IntNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema'

const organizationscalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationScalarWhereInputObjectSchema), z.lazy(() => OrganizationScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationScalarWhereInputObjectSchema), z.lazy(() => OrganizationScalarWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  orgName: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  parentId: z.union([z.lazy(() => IntNullableFilterObjectSchema), z.number().int()]).optional().nullable(),
  businessParentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  path: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  level: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  orgType: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  orderNum: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isVirtual: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  isEntity: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional()
}).strict();
export const OrganizationScalarWhereInputObjectSchema: z.ZodType<Prisma.OrganizationScalarWhereInput> = organizationscalarwhereinputSchema as unknown as z.ZodType<Prisma.OrganizationScalarWhereInput>;
export const OrganizationScalarWhereInputObjectZodSchema = organizationscalarwhereinputSchema;
