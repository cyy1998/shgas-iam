import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedCreateWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedCreateWithoutDelegationInput>;
export const DelegationDetailUncheckedCreateWithoutDelegationInputObjectZodSchema = makeSchema();
