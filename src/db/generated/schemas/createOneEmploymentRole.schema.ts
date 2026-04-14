import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleUncheckedCreateInputObjectSchema as EmploymentRoleUncheckedCreateInputObjectSchema } from './objects/EmploymentRoleUncheckedCreateInput.schema';

export const EmploymentRoleCreateOneSchema: z.ZodType<Prisma.EmploymentRoleCreateArgs> = z.object({   data: EmploymentRoleUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleCreateArgs>;

export const EmploymentRoleCreateOneZodSchema = z.object({   data: EmploymentRoleUncheckedCreateInputObjectSchema }).strict();