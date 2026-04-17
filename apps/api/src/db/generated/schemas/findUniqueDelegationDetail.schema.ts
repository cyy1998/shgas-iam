import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailFindUniqueSchema: z.ZodType<Prisma.DelegationDetailFindUniqueArgs> = z.object({   where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailFindUniqueArgs>;

export const DelegationDetailFindUniqueZodSchema = z.object({   where: DelegationDetailWhereUniqueInputObjectSchema }).strict();