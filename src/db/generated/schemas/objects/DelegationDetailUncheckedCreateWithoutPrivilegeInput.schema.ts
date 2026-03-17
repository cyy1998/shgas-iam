import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int()
}).strict();
export const DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedCreateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedCreateWithoutPrivilegeInput>;
export const DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectZodSchema = makeSchema();
