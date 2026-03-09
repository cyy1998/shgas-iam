import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  posOrgId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const PosOrgRoleCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCountOrderByAggregateInput>;
export const PosOrgRoleCountOrderByAggregateInputObjectZodSchema = makeSchema();
