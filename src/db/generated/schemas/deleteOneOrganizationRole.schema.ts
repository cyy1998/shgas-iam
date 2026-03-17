import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './objects/OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './objects/OrganizationRoleInclude.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleDeleteOneSchema: z.ZodType<Prisma.OrganizationRoleDeleteArgs> = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleDeleteArgs>;

export const OrganizationRoleDeleteOneZodSchema = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();