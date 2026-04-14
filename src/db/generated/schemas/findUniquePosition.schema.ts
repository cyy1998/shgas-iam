import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionFindUniqueSchema: z.ZodType<Prisma.PositionFindUniqueArgs> = z.object({   where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionFindUniqueArgs>;

export const PositionFindUniqueZodSchema = z.object({   where: PositionWhereUniqueInputObjectSchema }).strict();