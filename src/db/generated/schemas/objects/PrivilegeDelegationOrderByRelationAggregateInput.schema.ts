import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const PrivilegeDelegationOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationOrderByRelationAggregateInput>;
export const PrivilegeDelegationOrderByRelationAggregateInputObjectZodSchema = makeSchema();
