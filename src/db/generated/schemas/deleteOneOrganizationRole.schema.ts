import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleDeleteOneSchema: z.ZodType<Prisma.OrganizationRoleDeleteArgs> = z.object({   where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleDeleteArgs>;

export const OrganizationRoleDeleteOneZodSchema = z.object({   where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();