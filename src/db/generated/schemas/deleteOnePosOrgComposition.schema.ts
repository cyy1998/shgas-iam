import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionDeleteOneSchema: z.ZodType<Prisma.PosOrgCompositionDeleteArgs> = z.object({   where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionDeleteArgs>;

export const PosOrgCompositionDeleteOneZodSchema = z.object({   where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();