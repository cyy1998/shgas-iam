import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './objects/EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleCreateInputObjectSchema as EmploymentRoleCreateInputObjectSchema } from './objects/EmploymentRoleCreateInput.schema';
import { EmploymentRoleUncheckedCreateInputObjectSchema as EmploymentRoleUncheckedCreateInputObjectSchema } from './objects/EmploymentRoleUncheckedCreateInput.schema';

export const EmploymentRoleCreateOneSchema: z.ZodType<Prisma.EmploymentRoleCreateArgs> = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), data: z.union([EmploymentRoleCreateInputObjectSchema, EmploymentRoleUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleCreateArgs>;

export const EmploymentRoleCreateOneZodSchema = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), data: z.union([EmploymentRoleCreateInputObjectSchema, EmploymentRoleUncheckedCreateInputObjectSchema]) }).strict();