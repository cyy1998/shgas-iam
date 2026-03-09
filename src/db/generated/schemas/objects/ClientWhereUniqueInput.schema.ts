import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  clientCode: z.string().max(64).optional()
}).strict();
export const ClientWhereUniqueInputObjectSchema: z.ZodType<Prisma.ClientWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientWhereUniqueInput>;
export const ClientWhereUniqueInputObjectZodSchema = makeSchema();
