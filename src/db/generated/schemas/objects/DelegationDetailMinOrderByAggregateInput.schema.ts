import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  delegationId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const DelegationDetailMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailMinOrderByAggregateInput>;
export const DelegationDetailMinOrderByAggregateInputObjectZodSchema = makeSchema();
