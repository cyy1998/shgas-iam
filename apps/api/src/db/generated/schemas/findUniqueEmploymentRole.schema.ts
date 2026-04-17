import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleFindUniqueSchema: z.ZodType<Prisma.EmploymentRoleFindUniqueArgs> = z.object({   where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleFindUniqueArgs>;

export const EmploymentRoleFindUniqueZodSchema = z.object({   where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();