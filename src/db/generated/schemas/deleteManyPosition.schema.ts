import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './objects/PositionWhereInput.schema';

export const PositionDeleteManySchema: z.ZodType<Prisma.PositionDeleteManyArgs> = z.object({ where: PositionWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PositionDeleteManyArgs>;

export const PositionDeleteManyZodSchema = z.object({ where: PositionWhereInputObjectSchema.optional() }).strict();