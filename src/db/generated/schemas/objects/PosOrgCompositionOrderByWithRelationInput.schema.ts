import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { PositionOrderByWithRelationInputObjectSchema as PositionOrderByWithRelationInputObjectSchema } from './PositionOrderByWithRelationInput.schema';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './OrganizationOrderByWithRelationInput.schema';
import { EmploymentOrderByRelationAggregateInputObjectSchema as EmploymentOrderByRelationAggregateInputObjectSchema } from './EmploymentOrderByRelationAggregateInput.schema';
import { PosOrgRoleOrderByRelationAggregateInputObjectSchema as PosOrgRoleOrderByRelationAggregateInputObjectSchema } from './PosOrgRoleOrderByRelationAggregateInput.schema';
import { PosOrgCompositionOrderByRelevanceInputObjectSchema as PosOrgCompositionOrderByRelevanceInputObjectSchema } from './PosOrgCompositionOrderByRelevanceInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  orgId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  position: z.lazy(() => PositionOrderByWithRelationInputObjectSchema).optional(),
  organization: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentOrderByRelationAggregateInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => PosOrgCompositionOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionOrderByWithRelationInput>;
export const PosOrgCompositionOrderByWithRelationInputObjectZodSchema = makeSchema();
