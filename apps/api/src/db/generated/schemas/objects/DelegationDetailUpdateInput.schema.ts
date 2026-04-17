import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailUpdateInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateInput>;
export const DelegationDetailUpdateInputObjectZodSchema = makeSchema();
