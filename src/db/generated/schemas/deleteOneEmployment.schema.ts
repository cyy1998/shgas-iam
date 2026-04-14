import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentDeleteOneSchema: z.ZodType<Prisma.EmploymentDeleteArgs> = z.object({   where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentDeleteArgs>;

export const EmploymentDeleteOneZodSchema = z.object({   where: EmploymentWhereUniqueInputObjectSchema }).strict();