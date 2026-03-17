import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { EmploymentOrderByRelationAggregateInputObjectSchema as EmploymentOrderByRelationAggregateInputObjectSchema } from './EmploymentOrderByRelationAggregateInput.schema';
import { OrganizationRoleOrderByRelationAggregateInputObjectSchema as OrganizationRoleOrderByRelationAggregateInputObjectSchema } from './OrganizationRoleOrderByRelationAggregateInput.schema';
import { PosOrgCompositionOrderByRelationAggregateInputObjectSchema as PosOrgCompositionOrderByRelationAggregateInputObjectSchema } from './PosOrgCompositionOrderByRelationAggregateInput.schema';
import { OrganizationOrderByRelationAggregateInputObjectSchema as OrganizationOrderByRelationAggregateInputObjectSchema } from './OrganizationOrderByRelationAggregateInput.schema';
import { OrganizationClosureOrderByRelationAggregateInputObjectSchema as OrganizationClosureOrderByRelationAggregateInputObjectSchema } from './OrganizationClosureOrderByRelationAggregateInput.schema';
import { PrivilegeDelegationOrderByRelationAggregateInputObjectSchema as PrivilegeDelegationOrderByRelationAggregateInputObjectSchema } from './PrivilegeDelegationOrderByRelationAggregateInput.schema';
import { OrganizationOrderByRelevanceInputObjectSchema as OrganizationOrderByRelevanceInputObjectSchema } from './OrganizationOrderByRelevanceInput.schema'

const organizationorderbywithrelationinputSchema = z.object({
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
  deptEmployments: z.lazy(() => EmploymentOrderByRelationAggregateInputObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentOrderByRelationAggregateInputObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleOrderByRelationAggregateInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionOrderByRelationAggregateInputObjectSchema).optional(),
  parent: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  children: z.lazy(() => OrganizationOrderByRelationAggregateInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureOrderByRelationAggregateInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureOrderByRelationAggregateInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => OrganizationOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const OrganizationOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.OrganizationOrderByWithRelationInput> = organizationorderbywithrelationinputSchema as unknown as z.ZodType<Prisma.OrganizationOrderByWithRelationInput>;
export const OrganizationOrderByWithRelationInputObjectZodSchema = organizationorderbywithrelationinputSchema;
