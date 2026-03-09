import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const RolePrivilegeOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeOrderByRelationAggregateInput>;
export const RolePrivilegeOrderByRelationAggregateInputObjectZodSchema = makeSchema();
