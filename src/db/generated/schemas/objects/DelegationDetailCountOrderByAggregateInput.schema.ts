import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  delegationId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const DelegationDetailCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCountOrderByAggregateInput>;
export const DelegationDetailCountOrderByAggregateInputObjectZodSchema = makeSchema();
