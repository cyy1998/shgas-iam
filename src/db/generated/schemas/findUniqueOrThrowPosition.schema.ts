import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './objects/PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionFindUniqueOrThrowSchema: z.ZodType<Prisma.PositionFindUniqueOrThrowArgs> = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionFindUniqueOrThrowArgs>;

export const PositionFindUniqueOrThrowZodSchema = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema }).strict();