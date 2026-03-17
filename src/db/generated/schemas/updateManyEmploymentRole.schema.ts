import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleUpdateManyMutationInputObjectSchema as EmploymentRoleUpdateManyMutationInputObjectSchema } from './objects/EmploymentRoleUpdateManyMutationInput.schema';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';

export const EmploymentRoleUpdateManySchema: z.ZodType<Prisma.EmploymentRoleUpdateManyArgs> = z.object({ data: EmploymentRoleUpdateManyMutationInputObjectSchema, where: EmploymentRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyArgs>;

export const EmploymentRoleUpdateManyZodSchema = z.object({ data: EmploymentRoleUpdateManyMutationInputObjectSchema, where: EmploymentRoleWhereInputObjectSchema.optional() }).strict();