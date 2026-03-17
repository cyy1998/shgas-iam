import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput.schema'

const makeSchema = () => z.object({
  delegation: z.lazy(() => PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema)
}).strict();
export const DelegationDetailCreateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateWithoutPrivilegeInput>;
export const DelegationDetailCreateWithoutPrivilegeInputObjectZodSchema = makeSchema();
