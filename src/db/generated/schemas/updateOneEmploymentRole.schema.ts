import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './objects/EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleUpdateInputObjectSchema as EmploymentRoleUpdateInputObjectSchema } from './objects/EmploymentRoleUpdateInput.schema';
import { EmploymentRoleUncheckedUpdateInputObjectSchema as EmploymentRoleUncheckedUpdateInputObjectSchema } from './objects/EmploymentRoleUncheckedUpdateInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleUpdateOneSchema: z.ZodType<Prisma.EmploymentRoleUpdateArgs> = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), data: z.union([EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema]), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateArgs>;

export const EmploymentRoleUpdateOneZodSchema = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), data: z.union([EmploymentRoleUpdateInputObjectSchema, EmploymentRoleUncheckedUpdateInputObjectSchema]), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();