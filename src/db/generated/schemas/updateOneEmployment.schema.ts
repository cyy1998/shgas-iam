import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentUpdateInputObjectSchema as EmploymentUpdateInputObjectSchema } from './objects/EmploymentUpdateInput.schema';
import { EmploymentUncheckedUpdateInputObjectSchema as EmploymentUncheckedUpdateInputObjectSchema } from './objects/EmploymentUncheckedUpdateInput.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentUpdateOneSchema: z.ZodType<Prisma.EmploymentUpdateArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), data: z.union([EmploymentUpdateInputObjectSchema, EmploymentUncheckedUpdateInputObjectSchema]), where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentUpdateArgs>;

export const EmploymentUpdateOneZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), data: z.union([EmploymentUpdateInputObjectSchema, EmploymentUncheckedUpdateInputObjectSchema]), where: EmploymentWhereUniqueInputObjectSchema }).strict();