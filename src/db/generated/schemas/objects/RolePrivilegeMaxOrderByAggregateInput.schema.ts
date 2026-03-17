import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const RolePrivilegeMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeMaxOrderByAggregateInput>;
export const RolePrivilegeMaxOrderByAggregateInputObjectZodSchema = makeSchema();
