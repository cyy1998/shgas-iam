import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  isAllSub: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleMaxOrderByAggregateInput>;
export const OrganizationRoleMaxOrderByAggregateInputObjectZodSchema = makeSchema();
