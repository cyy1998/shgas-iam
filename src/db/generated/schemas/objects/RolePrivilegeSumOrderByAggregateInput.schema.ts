import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const RolePrivilegeSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeSumOrderByAggregateInput>;
export const RolePrivilegeSumOrderByAggregateInputObjectZodSchema = makeSchema();
