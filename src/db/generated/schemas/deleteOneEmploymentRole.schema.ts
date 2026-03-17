import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './objects/EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleDeleteOneSchema: z.ZodType<Prisma.EmploymentRoleDeleteArgs> = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleDeleteArgs>;

export const EmploymentRoleDeleteOneZodSchema = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();