import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  
}).strict();
export const DelegationDetailUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateManyMutationInput>;
export const DelegationDetailUpdateManyMutationInputObjectZodSchema = makeSchema();
