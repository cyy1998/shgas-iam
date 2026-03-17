import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { PrivilegeDelegationScalarRelationFilterObjectSchema as PrivilegeDelegationScalarRelationFilterObjectSchema } from './PrivilegeDelegationScalarRelationFilter.schema';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema';
import { PrivilegeScalarRelationFilterObjectSchema as PrivilegeScalarRelationFilterObjectSchema } from './PrivilegeScalarRelationFilter.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema'

const delegationdetailwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => DelegationDetailWhereInputObjectSchema), z.lazy(() => DelegationDetailWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => DelegationDetailWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => DelegationDetailWhereInputObjectSchema), z.lazy(() => DelegationDetailWhereInputObjectSchema).array()]).optional(),
  delegationId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  delegation: z.union([z.lazy(() => PrivilegeDelegationScalarRelationFilterObjectSchema), z.lazy(() => PrivilegeDelegationWhereInputObjectSchema)]).optional(),
  privilege: z.union([z.lazy(() => PrivilegeScalarRelationFilterObjectSchema), z.lazy(() => PrivilegeWhereInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailWhereInputObjectSchema: z.ZodType<Prisma.DelegationDetailWhereInput> = delegationdetailwhereinputSchema as unknown as z.ZodType<Prisma.DelegationDetailWhereInput>;
export const DelegationDetailWhereInputObjectZodSchema = delegationdetailwhereinputSchema;
