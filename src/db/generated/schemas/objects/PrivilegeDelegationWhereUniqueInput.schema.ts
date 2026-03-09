import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional()
}).strict();
export const PrivilegeDelegationWhereUniqueInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationWhereUniqueInput>;
export const PrivilegeDelegationWhereUniqueInputObjectZodSchema = makeSchema();
