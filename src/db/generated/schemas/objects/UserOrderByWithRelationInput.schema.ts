import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { EmploymentOrderByRelationAggregateInputObjectSchema as EmploymentOrderByRelationAggregateInputObjectSchema } from './EmploymentOrderByRelationAggregateInput.schema';
import { PrivilegeDelegationOrderByRelationAggregateInputObjectSchema as PrivilegeDelegationOrderByRelationAggregateInputObjectSchema } from './PrivilegeDelegationOrderByRelationAggregateInput.schema';
import { UserOrderByRelevanceInputObjectSchema as UserOrderByRelevanceInputObjectSchema } from './UserOrderByRelevanceInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  username: SortOrderSchema.optional(),
  wxId: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  name: SortOrderSchema.optional(),
  password: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  mobile: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  userType: SortOrderSchema.optional(),
  orderNum: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  employments: z.lazy(() => EmploymentOrderByRelationAggregateInputObjectSchema).optional(),
  delegationTo: z.lazy(() => PrivilegeDelegationOrderByRelationAggregateInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => UserOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const UserOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.UserOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.UserOrderByWithRelationInput>;
export const UserOrderByWithRelationInputObjectZodSchema = makeSchema();
