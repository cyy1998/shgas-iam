import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const OrganizationOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationOrderByRelationAggregateInput>;
export const OrganizationOrderByRelationAggregateInputObjectZodSchema = makeSchema();
