import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { PrivilegeDelegationOrderByWithRelationInputObjectSchema as PrivilegeDelegationOrderByWithRelationInputObjectSchema } from './PrivilegeDelegationOrderByWithRelationInput.schema';
import { PrivilegeOrderByWithRelationInputObjectSchema as PrivilegeOrderByWithRelationInputObjectSchema } from './PrivilegeOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  delegationId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional(),
  delegation: z.lazy(() => PrivilegeDelegationOrderByWithRelationInputObjectSchema).optional(),
  privilege: z.lazy(() => PrivilegeOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const DelegationDetailOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.DelegationDetailOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailOrderByWithRelationInput>;
export const DelegationDetailOrderByWithRelationInputObjectZodSchema = makeSchema();
