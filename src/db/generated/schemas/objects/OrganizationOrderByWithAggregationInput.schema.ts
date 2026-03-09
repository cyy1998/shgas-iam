import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { OrganizationCountOrderByAggregateInputObjectSchema as OrganizationCountOrderByAggregateInputObjectSchema } from './OrganizationCountOrderByAggregateInput.schema';
import { OrganizationAvgOrderByAggregateInputObjectSchema as OrganizationAvgOrderByAggregateInputObjectSchema } from './OrganizationAvgOrderByAggregateInput.schema';
import { OrganizationMaxOrderByAggregateInputObjectSchema as OrganizationMaxOrderByAggregateInputObjectSchema } from './OrganizationMaxOrderByAggregateInput.schema';
import { OrganizationMinOrderByAggregateInputObjectSchema as OrganizationMinOrderByAggregateInputObjectSchema } from './OrganizationMinOrderByAggregateInput.schema';
import { OrganizationSumOrderByAggregateInputObjectSchema as OrganizationSumOrderByAggregateInputObjectSchema } from './OrganizationSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  orgCode: SortOrderSchema.optional(),
  orgName: SortOrderSchema.optional(),
  parentId: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
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
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => OrganizationCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => OrganizationAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => OrganizationMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => OrganizationMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => OrganizationSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const OrganizationOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.OrganizationOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationOrderByWithAggregationInput>;
export const OrganizationOrderByWithAggregationInputObjectZodSchema = makeSchema();
