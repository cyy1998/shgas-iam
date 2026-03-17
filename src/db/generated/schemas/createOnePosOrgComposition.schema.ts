import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './objects/PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionCreateInputObjectSchema as PosOrgCompositionCreateInputObjectSchema } from './objects/PosOrgCompositionCreateInput.schema';
import { PosOrgCompositionUncheckedCreateInputObjectSchema as PosOrgCompositionUncheckedCreateInputObjectSchema } from './objects/PosOrgCompositionUncheckedCreateInput.schema';

export const PosOrgCompositionCreateOneSchema: z.ZodType<Prisma.PosOrgCompositionCreateArgs> = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), data: z.union([PosOrgCompositionCreateInputObjectSchema, PosOrgCompositionUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateArgs>;

export const PosOrgCompositionCreateOneZodSchema = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), data: z.union([PosOrgCompositionCreateInputObjectSchema, PosOrgCompositionUncheckedCreateInputObjectSchema]) }).strict();