import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { EmploymentOrderByRelationAggregateInputObjectSchema as EmploymentOrderByRelationAggregateInputObjectSchema } from './EmploymentOrderByRelationAggregateInput.schema';
import { PositionRoleOrderByRelationAggregateInputObjectSchema as PositionRoleOrderByRelationAggregateInputObjectSchema } from './PositionRoleOrderByRelationAggregateInput.schema';
import { PosOrgCompositionOrderByRelationAggregateInputObjectSchema as PosOrgCompositionOrderByRelationAggregateInputObjectSchema } from './PosOrgCompositionOrderByRelationAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posCode: SortOrderSchema.optional(),
  posName: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  employments: z.lazy(() => EmploymentOrderByRelationAggregateInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleOrderByRelationAggregateInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionOrderByRelationAggregateInputObjectSchema).optional()
}).strict();
export const PositionOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PositionOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionOrderByWithRelationInput>;
export const PositionOrderByWithRelationInputObjectZodSchema = makeSchema();
