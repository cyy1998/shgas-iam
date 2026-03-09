import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './objects/OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './objects/OrganizationRoleInclude.schema';
import { OrganizationRoleUpdateInputObjectSchema as OrganizationRoleUpdateInputObjectSchema } from './objects/OrganizationRoleUpdateInput.schema';
import { OrganizationRoleUncheckedUpdateInputObjectSchema as OrganizationRoleUncheckedUpdateInputObjectSchema } from './objects/OrganizationRoleUncheckedUpdateInput.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';

export const OrganizationRoleUpdateOneSchema: z.ZodType<Prisma.OrganizationRoleUpdateArgs> = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), data: z.union([OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema]), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateArgs>;

export const OrganizationRoleUpdateOneZodSchema = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), data: z.union([OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema]), where: OrganizationRoleWhereUniqueInputObjectSchema }).strict();