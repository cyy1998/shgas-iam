import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './objects/OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './objects/OrganizationRoleInclude.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleFindUniqueSchema: z.ZodType<Prisma.OrganizationRoleFindUniqueArgs> = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleFindUniqueArgs>;

export const OrganizationRoleFindUniqueZodSchema = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();