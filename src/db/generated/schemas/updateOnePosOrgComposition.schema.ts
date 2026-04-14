import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionUpdateInputObjectSchema as PosOrgCompositionUpdateInputObjectSchema } from './objects/PosOrgCompositionUpdateInput.schema';
import { PosOrgCompositionUncheckedUpdateInputObjectSchema as PosOrgCompositionUncheckedUpdateInputObjectSchema } from './objects/PosOrgCompositionUncheckedUpdateInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionUpdateOneSchema: z.ZodType<Prisma.PosOrgCompositionUpdateArgs> = z.object({   data: z.union([PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema]), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateArgs>;

export const PosOrgCompositionUpdateOneZodSchema = z.object({   data: z.union([PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema]), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();