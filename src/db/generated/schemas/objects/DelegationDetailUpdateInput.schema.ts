import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema as PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema } from './PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput.schema';
import { PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema as PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema } from './PrivilegeUpdateOneRequiredWithoutDelegationsNestedInput.schema'

const makeSchema = () => z.object({
  delegation: z.lazy(() => PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema).optional(),
  privilege: z.lazy(() => PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema).optional()
}).strict();
export const DelegationDetailUpdateInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateInput>;
export const DelegationDetailUpdateInputObjectZodSchema = makeSchema();
