import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './objects/PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionDeleteOneSchema: z.ZodType<Prisma.PosOrgCompositionDeleteArgs> = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionDeleteArgs>;

export const PosOrgCompositionDeleteOneZodSchema = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();