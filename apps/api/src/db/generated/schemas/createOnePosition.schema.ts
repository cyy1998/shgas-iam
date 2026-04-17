import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionUncheckedCreateInputObjectSchema as PositionUncheckedCreateInputObjectSchema } from './objects/PositionUncheckedCreateInput.schema';

export const PositionCreateOneSchema: z.ZodType<Prisma.PositionCreateArgs> = z.object({   data: PositionUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionCreateArgs>;

export const PositionCreateOneZodSchema = z.object({   data: PositionUncheckedCreateInputObjectSchema }).strict();