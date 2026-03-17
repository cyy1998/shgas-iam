import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './objects/EmploymentWhereInput.schema';

export const EmploymentDeleteManySchema: z.ZodType<Prisma.EmploymentDeleteManyArgs> = z.object({ where: EmploymentWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentDeleteManyArgs>;

export const EmploymentDeleteManyZodSchema = z.object({ where: EmploymentWhereInputObjectSchema.optional() }).strict();