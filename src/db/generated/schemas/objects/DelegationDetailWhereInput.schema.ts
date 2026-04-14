import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const delegationdetailwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => DelegationDetailWhereInputObjectSchema), z.lazy(() => DelegationDetailWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => DelegationDetailWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => DelegationDetailWhereInputObjectSchema), z.lazy(() => DelegationDetailWhereInputObjectSchema).array()]).optional(),
  delegationId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const DelegationDetailWhereInputObjectSchema: z.ZodType<Prisma.DelegationDetailWhereInput> = delegationdetailwhereinputSchema as unknown as z.ZodType<Prisma.DelegationDetailWhereInput>;
export const DelegationDetailWhereInputObjectZodSchema = delegationdetailwhereinputSchema;
