import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './objects/PosOrgCompositionWhereInput.schema';

export const PosOrgCompositionDeleteManySchema: z.ZodType<Prisma.PosOrgCompositionDeleteManyArgs> = z.object({ where: PosOrgCompositionWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionDeleteManyArgs>;

export const PosOrgCompositionDeleteManyZodSchema = z.object({ where: PosOrgCompositionWhereInputObjectSchema.optional() }).strict();