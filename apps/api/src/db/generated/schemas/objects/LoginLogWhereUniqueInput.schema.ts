import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional()
}).strict();
export const LoginLogWhereUniqueInputObjectSchema: z.ZodType<Prisma.LoginLogWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogWhereUniqueInput>;
export const LoginLogWhereUniqueInputObjectZodSchema = makeSchema();
