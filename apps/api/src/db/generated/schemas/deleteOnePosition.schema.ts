import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionDeleteOneSchema: z.ZodType<Prisma.PositionDeleteArgs> = z.object({   where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionDeleteArgs>;

export const PositionDeleteOneZodSchema = z.object({   where: PositionWhereUniqueInputObjectSchema }).strict();