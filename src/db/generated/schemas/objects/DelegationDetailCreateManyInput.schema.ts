import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const DelegationDetailCreateManyInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyInput>;
export const DelegationDetailCreateManyInputObjectZodSchema = makeSchema();
