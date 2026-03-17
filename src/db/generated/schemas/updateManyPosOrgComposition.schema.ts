import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgCompositionUpdateManyMutationInputObjectSchema as PosOrgCompositionUpdateManyMutationInputObjectSchema } from './objects/PosOrgCompositionUpdateManyMutationInput.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './objects/PosOrgCompositionWhereInput.schema';

export const PosOrgCompositionUpdateManySchema: z.ZodType<Prisma.PosOrgCompositionUpdateManyArgs> = z.object({ data: PosOrgCompositionUpdateManyMutationInputObjectSchema, where: PosOrgCompositionWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateManyArgs>;

export const PosOrgCompositionUpdateManyZodSchema = z.object({ data: PosOrgCompositionUpdateManyMutationInputObjectSchema, where: PosOrgCompositionWhereInputObjectSchema.optional() }).strict();