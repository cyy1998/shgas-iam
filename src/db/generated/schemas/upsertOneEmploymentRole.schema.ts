import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './objects/EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleCreateInputObjectSchema as EmploymentRoleCreateInputObjectSchema } from './objects/EmploymentRoleCreateInput.schema';
import { EmploymentRoleUncheckedCreateInputObjectSchema as EmploymentRoleUncheckedCreateInputObjectSchema } from './objects/EmploymentRoleUncheckedCreateInput.schema';
import { EmploymentRoleUpdateInputObjectSchema as EmploymentRoleUpdateInputObjectSchema } from './objects/EmploymentRoleUpdateInput.schema';
import { EmploymentRoleUncheckedUpdateInputObjectSchema as EmploymentRoleUncheckedUpdateInputObjectSchema } from './objects/EmploymentRoleUncheckedUpdateInput.schema';

export const EmploymentRoleUpsertOneSchema: z.ZodType<Prisma.EmploymentRoleUpsertArgs> = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema, create: z.union([ EmploymentRoleCreateInputObjectSchema, EmploymentRoleUncheckedCreateInputObjectSchema ]), update: z.union([ EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleUpsertArgs>;

export const EmploymentRoleUpsertOneZodSchema = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema, create: z.union([ EmploymentRoleCreateInputObjectSchema, EmploymentRoleUncheckedCreateInputObjectSchema ]), update: z.union([ EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema ]) }).strict();