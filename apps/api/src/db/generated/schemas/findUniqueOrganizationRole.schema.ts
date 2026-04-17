import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleFindUniqueSchema: z.ZodType<Prisma.OrganizationRoleFindUniqueArgs> = z.object({   where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleFindUniqueArgs>;

export const OrganizationRoleFindUniqueZodSchema = z.object({   where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();