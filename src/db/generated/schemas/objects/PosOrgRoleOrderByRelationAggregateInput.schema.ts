import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const PosOrgRoleOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleOrderByRelationAggregateInput>;
export const PosOrgRoleOrderByRelationAggregateInputObjectZodSchema = makeSchema();
