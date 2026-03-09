import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailUncheckedCreateInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedCreateInput>;
export const DelegationDetailUncheckedCreateInputObjectZodSchema = makeSchema();
