import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const RolePrivilegeCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCountOrderByAggregateInput>;
export const RolePrivilegeCountOrderByAggregateInputObjectZodSchema = makeSchema();
