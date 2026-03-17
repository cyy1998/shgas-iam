import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { JsonFilterObjectSchema as JsonFilterObjectSchema } from './JsonFilter.schema';
import { RoleListRelationFilterObjectSchema as RoleListRelationFilterObjectSchema } from './RoleListRelationFilter.schema'

const clientwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => ClientWhereInputObjectSchema), z.lazy(() => ClientWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => ClientWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => ClientWhereInputObjectSchema), z.lazy(() => ClientWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  clientCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(64)]).optional(),
  clientName: z.union([z.lazy(() => StringFilterObjectSchema), z.string().max(128)]).optional(),
  url: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(128)]).optional().nullable(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  extAttributes: z.lazy(() => JsonFilterObjectSchema).optional(),
  roles: z.lazy(() => RoleListRelationFilterObjectSchema).optional()
}).strict();
export const ClientWhereInputObjectSchema: z.ZodType<Prisma.ClientWhereInput> = clientwhereinputSchema as unknown as z.ZodType<Prisma.ClientWhereInput>;
export const ClientWhereInputObjectZodSchema = clientwhereinputSchema;
