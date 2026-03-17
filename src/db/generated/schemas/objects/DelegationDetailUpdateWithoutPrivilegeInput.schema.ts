import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema as PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema } from './PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput.schema'

const makeSchema = () => z.object({
  delegation: z.lazy(() => PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInputObjectSchema).optional()
}).strict();
export const DelegationDetailUpdateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateWithoutPrivilegeInput>;
export const DelegationDetailUpdateWithoutPrivilegeInputObjectZodSchema = makeSchema();
