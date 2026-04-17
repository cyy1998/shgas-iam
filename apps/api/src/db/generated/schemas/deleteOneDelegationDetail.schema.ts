import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailDeleteOneSchema: z.ZodType<Prisma.DelegationDetailDeleteArgs> = z.object({   where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailDeleteArgs>;

export const DelegationDetailDeleteOneZodSchema = z.object({   where: DelegationDetailWhereUniqueInputObjectSchema }).strict();