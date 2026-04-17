import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailUpdateInputObjectSchema as DelegationDetailUpdateInputObjectSchema } from './objects/DelegationDetailUpdateInput.schema';
import { DelegationDetailUncheckedUpdateInputObjectSchema as DelegationDetailUncheckedUpdateInputObjectSchema } from './objects/DelegationDetailUncheckedUpdateInput.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailUpdateOneSchema: z.ZodType<Prisma.DelegationDetailUpdateArgs> = z.object({   data: z.union([DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema]), where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailUpdateArgs>;

export const DelegationDetailUpdateOneZodSchema = z.object({   data: z.union([DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema]), where: DelegationDetailWhereUniqueInputObjectSchema }).strict();