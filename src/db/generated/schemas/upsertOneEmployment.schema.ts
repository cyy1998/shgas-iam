import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';
import { EmploymentCreateInputObjectSchema as EmploymentCreateInputObjectSchema } from './objects/EmploymentCreateInput.schema';
import { EmploymentUncheckedCreateInputObjectSchema as EmploymentUncheckedCreateInputObjectSchema } from './objects/EmploymentUncheckedCreateInput.schema';
import { EmploymentUpdateInputObjectSchema as EmploymentUpdateInputObjectSchema } from './objects/EmploymentUpdateInput.schema';
import { EmploymentUncheckedUpdateInputObjectSchema as EmploymentUncheckedUpdateInputObjectSchema } from './objects/EmploymentUncheckedUpdateInput.schema';

export const EmploymentUpsertOneSchema: z.ZodType<Prisma.EmploymentUpsertArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema, create: z.union([ EmploymentCreateInputObjectSchema, EmploymentUncheckedCreateInputObjectSchema ]), update: z.union([ EmploymentUpdateInputObjectSchema, EmploymentUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.EmploymentUpsertArgs>;

export const EmploymentUpsertOneZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema, create: z.union([ EmploymentCreateInputObjectSchema, EmploymentUncheckedCreateInputObjectSchema ]), update: z.union([ EmploymentUpdateInputObjectSchema, EmploymentUncheckedUpdateInputObjectSchema ]) }).strict();