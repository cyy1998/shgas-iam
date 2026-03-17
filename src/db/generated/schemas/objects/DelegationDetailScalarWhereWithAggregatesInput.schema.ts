import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const delegationdetailscalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => DelegationDetailScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => DelegationDetailScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => DelegationDetailScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  delegationId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const DelegationDetailScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.DelegationDetailScalarWhereWithAggregatesInput> = delegationdetailscalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.DelegationDetailScalarWhereWithAggregatesInput>;
export const DelegationDetailScalarWhereWithAggregatesInputObjectZodSchema = delegationdetailscalarwherewithaggregatesinputSchema;
