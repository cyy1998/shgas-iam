import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { StringFilterObjectSchema as StringFilterObjectSchema } from './StringFilter.schema';
import { JsonNullableFilterObjectSchema as JsonNullableFilterObjectSchema } from './JsonNullableFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { RolePrivilegeListRelationFilterObjectSchema as RolePrivilegeListRelationFilterObjectSchema } from './RolePrivilegeListRelationFilter.schema';
import { DelegationDetailListRelationFilterObjectSchema as DelegationDetailListRelationFilterObjectSchema } from './DelegationDetailListRelationFilter.schema'

const privilegewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PrivilegeWhereInputObjectSchema), z.lazy(() => PrivilegeWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PrivilegeWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PrivilegeWhereInputObjectSchema), z.lazy(() => PrivilegeWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeCode: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  privilegeName: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
  fieldValues: z.lazy(() => JsonNullableFilterObjectSchema).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  roles: z.lazy(() => RolePrivilegeListRelationFilterObjectSchema).optional(),
  delegations: z.lazy(() => DelegationDetailListRelationFilterObjectSchema).optional()
}).strict();
export const PrivilegeWhereInputObjectSchema: z.ZodType<Prisma.PrivilegeWhereInput> = privilegewhereinputSchema as unknown as z.ZodType<Prisma.PrivilegeWhereInput>;
export const PrivilegeWhereInputObjectZodSchema = privilegewhereinputSchema;
