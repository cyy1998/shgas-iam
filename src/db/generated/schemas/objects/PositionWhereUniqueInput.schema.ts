import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posCode: z.string().max(64).optional()
}).strict();
export const PositionWhereUniqueInputObjectSchema: z.ZodType<Prisma.PositionWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionWhereUniqueInput>;
export const PositionWhereUniqueInputObjectZodSchema = makeSchema();
