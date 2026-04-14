import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleUpdateInputObjectSchema as EmploymentRoleUpdateInputObjectSchema } from './objects/EmploymentRoleUpdateInput.schema';
import { EmploymentRoleUncheckedUpdateInputObjectSchema as EmploymentRoleUncheckedUpdateInputObjectSchema } from './objects/EmploymentRoleUncheckedUpdateInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleUpdateOneSchema: z.ZodType<Prisma.EmploymentRoleUpdateArgs> = z.object({   data: z.union([EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema]), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateArgs>;

export const EmploymentRoleUpdateOneZodSchema = z.object({   data: z.union([EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema]), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();