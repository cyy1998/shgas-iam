import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const RolePrivilegeAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeAvgOrderByAggregateInput>;
export const RolePrivilegeAvgOrderByAggregateInputObjectZodSchema = makeSchema();
