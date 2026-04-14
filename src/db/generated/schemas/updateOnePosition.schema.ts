import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionUpdateInputObjectSchema as PositionUpdateInputObjectSchema } from './objects/PositionUpdateInput.schema';
import { PositionUncheckedUpdateInputObjectSchema as PositionUncheckedUpdateInputObjectSchema } from './objects/PositionUncheckedUpdateInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionUpdateOneSchema: z.ZodType<Prisma.PositionUpdateArgs> = z.object({   data: z.union([PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema]), where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionUpdateArgs>;

export const PositionUpdateOneZodSchema = z.object({   data: z.union([PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema]), where: PositionWhereUniqueInputObjectSchema }).strict();