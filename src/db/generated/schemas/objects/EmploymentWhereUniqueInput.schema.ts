import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional()
}).strict();
export const EmploymentWhereUniqueInputObjectSchema: z.ZodType<Prisma.EmploymentWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentWhereUniqueInput>;
export const EmploymentWhereUniqueInputObjectZodSchema = makeSchema();
