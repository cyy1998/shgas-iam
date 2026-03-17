import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { DateTimeFilterObjectSchema as DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { StringNullableFilterObjectSchema as StringNullableFilterObjectSchema } from './StringNullableFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { UserScalarRelationFilterObjectSchema as UserScalarRelationFilterObjectSchema } from './UserScalarRelationFilter.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { OrganizationScalarRelationFilterObjectSchema as OrganizationScalarRelationFilterObjectSchema } from './OrganizationScalarRelationFilter.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { DelegationDetailListRelationFilterObjectSchema as DelegationDetailListRelationFilterObjectSchema } from './DelegationDetailListRelationFilter.schema'

const privilegedelegationwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PrivilegeDelegationWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PrivilegeDelegationWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  delegatorUserId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  delegateeUserId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  organizationScopeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  startTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  endTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  status: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  description: z.union([z.lazy(() => StringNullableFilterObjectSchema), z.string().max(500)]).optional().nullable(),
  isDelete: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  createTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  updateTime: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.coerce.date()]).optional(),
  delegatorUser: z.union([z.lazy(() => UserScalarRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)]).optional(),
  delegateeUser: z.union([z.lazy(() => UserScalarRelationFilterObjectSchema), z.lazy(() => UserWhereInputObjectSchema)]).optional(),
  organizationScope: z.union([z.lazy(() => OrganizationScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  delegationDetails: z.lazy(() => DelegationDetailListRelationFilterObjectSchema).optional()
}).strict();
export const PrivilegeDelegationWhereInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationWhereInput> = privilegedelegationwhereinputSchema as unknown as z.ZodType<Prisma.PrivilegeDelegationWhereInput>;
export const PrivilegeDelegationWhereInputObjectZodSchema = privilegedelegationwhereinputSchema;
