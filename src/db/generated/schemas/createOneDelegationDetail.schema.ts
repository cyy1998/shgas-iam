import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailUncheckedCreateInputObjectSchema as DelegationDetailUncheckedCreateInputObjectSchema } from './objects/DelegationDetailUncheckedCreateInput.schema';

export const DelegationDetailCreateOneSchema: z.ZodType<Prisma.DelegationDetailCreateArgs> = z.object({   data: DelegationDetailUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailCreateArgs>;

export const DelegationDetailCreateOneZodSchema = z.object({   data: DelegationDetailUncheckedCreateInputObjectSchema }).strict();