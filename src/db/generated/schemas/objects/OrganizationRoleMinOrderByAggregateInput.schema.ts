import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  isAllSub: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleMinOrderByAggregateInput>;
export const OrganizationRoleMinOrderByAggregateInputObjectZodSchema = makeSchema();
