import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionFindUniqueSchema: z.ZodType<Prisma.PosOrgCompositionFindUniqueArgs> = z.object({   where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionFindUniqueArgs>;

export const PosOrgCompositionFindUniqueZodSchema = z.object({   where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();