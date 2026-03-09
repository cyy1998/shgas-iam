import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './objects/PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionCreateInputObjectSchema as PositionCreateInputObjectSchema } from './objects/PositionCreateInput.schema';
import { PositionUncheckedCreateInputObjectSchema as PositionUncheckedCreateInputObjectSchema } from './objects/PositionUncheckedCreateInput.schema';

export const PositionCreateOneSchema: z.ZodType<Prisma.PositionCreateArgs> = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), data: z.union([PositionCreateInputObjectSchema, PositionUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PositionCreateArgs>;

export const PositionCreateOneZodSchema = z.object({ select: PositionSelectObjectSchema.optional(), include: PositionIncludeObjectSchema.optional(), data: z.union([PositionCreateInputObjectSchema, PositionUncheckedCreateInputObjectSchema]) }).strict();