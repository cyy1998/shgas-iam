import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentFindUniqueSchema: z.ZodType<Prisma.EmploymentFindUniqueArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentFindUniqueArgs>;

export const EmploymentFindUniqueZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict();