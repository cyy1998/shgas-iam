import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './objects/PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';

export const PositionFindUniqueSchema: z.ZodType<Prisma.PositionFindUniqueArgs> = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionFindUniqueArgs>;

export const PositionFindUniqueZodSchema = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), where: PositionWhereUniqueInputObjectSchema }).strict();