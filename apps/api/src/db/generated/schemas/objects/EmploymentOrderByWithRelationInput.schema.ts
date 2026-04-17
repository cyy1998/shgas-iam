import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { UserOrderByWithRelationInputObjectSchema as UserOrderByWithRelationInputObjectSchema } from './UserOrderByWithRelationInput.schema';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './OrganizationOrderByWithRelationInput.schema';
import { PositionOrderByWithRelationInputObjectSchema as PositionOrderByWithRelationInputObjectSchema } from './PositionOrderByWithRelationInput.schema';
import { PosOrgCompositionOrderByWithRelationInputObjectSchema as PosOrgCompositionOrderByWithRelationInputObjectSchema } from './PosOrgCompositionOrderByWithRelationInput.schema';
import { EmploymentRoleOrderByRelationAggregateInputObjectSchema as EmploymentRoleOrderByRelationAggregateInputObjectSchema } from './EmploymentRoleOrderByRelationAggregateInput.schema';
import { EmploymentOrderByRelevanceInputObjectSchema as EmploymentOrderByRelevanceInputObjectSchema } from './EmploymentOrderByRelevanceInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  orgId: SortOrderSchema.optional(),
  compId: SortOrderSchema.optional(),
  isPrimary: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  user: z.lazy(() => UserOrderByWithRelationInputObjectSchema).optional(),
  deptartment: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  company: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  position: z.lazy(() => PositionOrderByWithRelationInputObjectSchema).optional(),
  posOrg: z.lazy(() => PosOrgCompositionOrderByWithRelationInputObjectSchema).optional(),
  roles: z.lazy(() => EmploymentRoleOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => EmploymentOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const EmploymentOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.EmploymentOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentOrderByWithRelationInput>;
export const EmploymentOrderByWithRelationInputObjectZodSchema = makeSchema();
