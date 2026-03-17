import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './objects/OrganizationRoleWhereInput.schema';

export const OrganizationRoleDeleteManySchema: z.ZodType<Prisma.OrganizationRoleDeleteManyArgs> = z.object({ where: OrganizationRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleDeleteManyArgs>;

export const OrganizationRoleDeleteManyZodSchema = z.object({ where: OrganizationRoleWhereInputObjectSchema.optional() }).strict();