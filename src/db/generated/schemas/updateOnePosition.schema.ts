import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './objects/PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionUpdateInputObjectSchema as PositionUpdateInputObjectSchema } from './objects/PositionUpdateInput.schema';
import { PositionUncheckedUpdateInputObjectSchema as PositionUncheckedUpdateInputObjectSchema } from './objects/PositionUncheckedUpdateInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionUpdateOneSchema: z.ZodType<Prisma.PositionUpdateArgs> = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), data: z.union([PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema]), where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionUpdateArgs>;

export const PositionUpdateOneZodSchema = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), data: z.union([PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema]), where: PositionWhereUniqueInputObjectSchema }).strict();