import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentFindUniqueSchema: z.ZodType<Prisma.EmploymentFindUniqueArgs> = z.object({   where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentFindUniqueArgs>;

export const EmploymentFindUniqueZodSchema = z.object({   where: EmploymentWhereUniqueInputObjectSchema }).strict();