import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailUpdateManyMutationInputObjectSchema as DelegationDetailUpdateManyMutationInputObjectSchema } from './objects/DelegationDetailUpdateManyMutationInput.schema';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './objects/DelegationDetailWhereInput.schema';

export const DelegationDetailUpdateManySchema: z.ZodType<Prisma.DelegationDetailUpdateManyArgs> = z.object({ data: DelegationDetailUpdateManyMutationInputObjectSchema, where: DelegationDetailWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.DelegationDetailUpdateManyArgs>;

export const DelegationDetailUpdateManyZodSchema = z.object({ data: DelegationDetailUpdateManyMutationInputObjectSchema, where: DelegationDetailWhereInputObjectSchema.optional() }).strict();