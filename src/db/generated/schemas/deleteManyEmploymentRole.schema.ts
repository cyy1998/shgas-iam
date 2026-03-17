import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';

export const EmploymentRoleDeleteManySchema: z.ZodType<Prisma.EmploymentRoleDeleteManyArgs> = z.object({ where: EmploymentRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleDeleteManyArgs>;

export const EmploymentRoleDeleteManyZodSchema = z.object({ where: EmploymentRoleWhereInputObjectSchema.optional() }).strict();