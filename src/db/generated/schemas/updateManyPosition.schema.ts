import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionUpdateManyMutationInputObjectSchema as PositionUpdateManyMutationInputObjectSchema } from './objects/PositionUpdateManyMutationInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './objects/PositionWhereInput.schema';

export const PositionUpdateManySchema: z.ZodType<Prisma.PositionUpdateManyArgs> = z.object({ data: PositionUpdateManyMutationInputObjectSchema, where: PositionWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PositionUpdateManyArgs>;

export const PositionUpdateManyZodSchema = z.object({ data: PositionUpdateManyMutationInputObjectSchema, where: PositionWhereInputObjectSchema.optional() }).strict();