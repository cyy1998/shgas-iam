import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentUncheckedCreateInputObjectSchema as EmploymentUncheckedCreateInputObjectSchema } from './objects/EmploymentUncheckedCreateInput.schema';

export const EmploymentCreateOneSchema: z.ZodType<Prisma.EmploymentCreateArgs> = z.object({   data: EmploymentUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentCreateArgs>;

export const EmploymentCreateOneZodSchema = z.object({   data: EmploymentUncheckedCreateInputObjectSchema }).strict();