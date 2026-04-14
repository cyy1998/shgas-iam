import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleUpdateInputObjectSchema as OrganizationRoleUpdateInputObjectSchema } from './objects/OrganizationRoleUpdateInput.schema';
import { OrganizationRoleUncheckedUpdateInputObjectSchema as OrganizationRoleUncheckedUpdateInputObjectSchema } from './objects/OrganizationRoleUncheckedUpdateInput.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleUpdateOneSchema: z.ZodType<Prisma.OrganizationRoleUpdateArgs> = z.object({   data: z.union([OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema]), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateArgs>;

export const OrganizationRoleUpdateOneZodSchema = z.object({   data: z.union([OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema]), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();