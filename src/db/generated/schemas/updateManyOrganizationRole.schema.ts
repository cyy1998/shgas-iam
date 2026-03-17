import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleUpdateManyMutationInputObjectSchema as OrganizationRoleUpdateManyMutationInputObjectSchema } from './objects/OrganizationRoleUpdateManyMutationInput.schema';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './objects/OrganizationRoleWhereInput.schema';

export const OrganizationRoleUpdateManySchema: z.ZodType<Prisma.OrganizationRoleUpdateManyArgs> = z.object({ data: OrganizationRoleUpdateManyMutationInputObjectSchema, where: OrganizationRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateManyArgs>;

export const OrganizationRoleUpdateManyZodSchema = z.object({ data: OrganizationRoleUpdateManyMutationInputObjectSchema, where: OrganizationRoleWhereInputObjectSchema.optional() }).strict();