import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './objects/EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';

export const EmploymentRoleFindUniqueOrThrowSchema: z.ZodType<Prisma.EmploymentRoleFindUniqueOrThrowArgs> = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleFindUniqueOrThrowArgs>;

export const EmploymentRoleFindUniqueOrThrowZodSchema = z.object({ select: EmploymentRoleSelectObjectSchema.optional(), include: EmploymentRoleIncludeObjectSchema.optional(), where: EmploymentRoleWhereUniqueInputObjectSchema }).strict();