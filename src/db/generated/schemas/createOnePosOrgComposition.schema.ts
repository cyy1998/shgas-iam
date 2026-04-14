import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionUncheckedCreateInputObjectSchema as PosOrgCompositionUncheckedCreateInputObjectSchema } from './objects/PosOrgCompositionUncheckedCreateInput.schema';

export const PosOrgCompositionCreateOneSchema: z.ZodType<Prisma.PosOrgCompositionCreateArgs> = z.object({   data: PosOrgCompositionUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateArgs>;

export const PosOrgCompositionCreateOneZodSchema = z.object({   data: PosOrgCompositionUncheckedCreateInputObjectSchema }).strict();