import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './objects/PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';
import { PositionCreateInputObjectSchema as PositionCreateInputObjectSchema } from './objects/PositionCreateInput.schema';
import { PositionUncheckedCreateInputObjectSchema as PositionUncheckedCreateInputObjectSchema } from './objects/PositionUncheckedCreateInput.schema';
import { PositionUpdateInputObjectSchema as PositionUpdateInputObjectSchema } from './objects/PositionUpdateInput.schema';
import { PositionUncheckedUpdateInputObjectSchema as PositionUncheckedUpdateInputObjectSchema } from './objects/PositionUncheckedUpdateInput.schema';

export const PositionUpsertOneSchema: z.ZodType<Prisma.PositionUpsertArgs> = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema, create: z.union([ PositionCreateInputObjectSchema, PositionUncheckedCreateInputObjectSchema ]), update: z.union([ PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PositionUpsertArgs>;

export const PositionUpsertOneZodSchema = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema, create: z.union([ PositionCreateInputObjectSchema, PositionUncheckedCreateInputObjectSchema ]), update: z.union([ PositionUpdateInputObjectSchema, PositionUncheckedUpdateInputObjectSchema ]) }).strict();