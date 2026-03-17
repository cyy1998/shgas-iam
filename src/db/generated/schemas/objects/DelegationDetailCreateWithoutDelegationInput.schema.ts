import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema as PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema } from './PrivilegeCreateNestedOneWithoutDelegationsInput.schema'

const makeSchema = () => z.object({
  privilege: z.lazy(() => PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema)
}).strict();
export const DelegationDetailCreateWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateWithoutDelegationInput>;
export const DelegationDetailCreateWithoutDelegationInputObjectZodSchema = makeSchema();
