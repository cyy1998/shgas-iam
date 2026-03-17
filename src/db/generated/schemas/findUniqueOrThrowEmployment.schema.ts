import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentFindUniqueOrThrowSchema: z.ZodType<Prisma.EmploymentFindUniqueOrThrowArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentFindUniqueOrThrowArgs>;

export const EmploymentFindUniqueOrThrowZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict();