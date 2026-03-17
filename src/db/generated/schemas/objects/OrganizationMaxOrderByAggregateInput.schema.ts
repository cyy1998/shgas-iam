import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  orgCode: SortOrderSchema.optional(),
  orgName: SortOrderSchema.optional(),
  parentId: SortOrderSchema.optional(),
  businessParentId: SortOrderSchema.optional(),
  path: SortOrderSchema.optional(),
  level: SortOrderSchema.optional(),
  orgType: SortOrderSchema.optional(),
  orderNum: SortOrderSchema.optional(),
  isVirtual: SortOrderSchema.optional(),
  isEntity: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const OrganizationMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationMaxOrderByAggregateInput>;
export const OrganizationMaxOrderByAggregateInputObjectZodSchema = makeSchema();
