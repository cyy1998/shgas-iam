import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './objects/OrganizationRoleWhereInput.schema';

export const OrganizationRoleDeleteManySchema: z.ZodType<Prisma.OrganizationRoleDeleteManyArgs> = z.object({ where: OrganizationRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleDeleteManyArgs>;

export const OrganizationRoleDeleteManyZodSchema = z.object({ where: OrganizationRoleWhereInputObjectSchema.optional() }).strict();