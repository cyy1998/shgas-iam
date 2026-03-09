import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { RolePrivilegeOrderByRelationAggregateInputObjectSchema as RolePrivilegeOrderByRelationAggregateInputObjectSchema } from './RolePrivilegeOrderByRelationAggregateInput.schema';
import { DelegationDetailOrderByRelationAggregateInputObjectSchema as DelegationDetailOrderByRelationAggregateInputObjectSchema } from './DelegationDetailOrderByRelationAggregateInput.schema';
import { PrivilegeOrderByRelevanceInputObjectSchema as PrivilegeOrderByRelevanceInputObjectSchema } from './PrivilegeOrderByRelevanceInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  privilegeCode: SortOrderSchema.optional(),
  privilegeName: SortOrderSchema.optional(),
  fieldValues: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  roles: z.lazy(() => RolePrivilegeOrderByRelationAggregateInputObjectSchema).optional(),
  delegations: z.lazy(() => DelegationDetailOrderByRelationAggregateInputObjectSchema).optional(),
  _relevance: z.lazy(() => PrivilegeOrderByRelevanceInputObjectSchema).optional()
}).strict();
export const PrivilegeOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PrivilegeOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeOrderByWithRelationInput>;
export const PrivilegeOrderByWithRelationInputObjectZodSchema = makeSchema();
