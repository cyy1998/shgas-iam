import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailCreateManyDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateManyDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyDelegationInput>;
export const DelegationDetailCreateManyDelegationInputObjectZodSchema = makeSchema();
