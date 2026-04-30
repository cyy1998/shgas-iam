import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { UserOrderByWithRelationInputObjectSchema as UserOrderByWithRelationInputObjectSchema } from './UserOrderByWithRelationInput.schema';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './OrganizationOrderByWithRelationInput.schema';
import { DelegationDetailOrderByRelationAggregateInputObjectSchema as DelegationDetailOrderByRelationAggregateInputObjectSchema } from './DelegationDetailOrderByRelationAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  delegatorUserId: SortOrderSchema.optional(),
  delegateeUserId: SortOrderSchema.optional(),
  organizationScopeId: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  delegatorUser: z.lazy(() => UserOrderByWithRelationInputObjectSchema).optional(),
  delegateeUser: z.lazy(() => UserOrderByWithRelationInputObjectSchema).optional(),
  organizationScope: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  delegationDetails: z.lazy(() => DelegationDetailOrderByRelationAggregateInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationOrderByWithRelationInput>;
export const PrivilegeDelegationOrderByWithRelationInputObjectZodSchema = makeSchema();
