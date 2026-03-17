import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema as PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema } from './PrivilegeUpdateOneRequiredWithoutDelegationsNestedInput.schema'

const makeSchema = () => z.object({
  privilege: z.lazy(() => PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema).optional()
}).strict();
export const DelegationDetailUpdateWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateWithoutDelegationInput>;
export const DelegationDetailUpdateWithoutDelegationInputObjectZodSchema = makeSchema();
