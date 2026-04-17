import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleDeleteOneSchema: z.ZodType<Prisma.EmploymentRoleDeleteArgs> = z.object({   where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleDeleteArgs>;

export const EmploymentRoleDeleteOneZodSchema = z.object({   where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();