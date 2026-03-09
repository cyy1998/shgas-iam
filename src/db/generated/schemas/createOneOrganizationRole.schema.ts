import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './objects/OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './objects/OrganizationRoleInclude.schema';
import { OrganizationRoleCreateInputObjectSchema as OrganizationRoleCreateInputObjectSchema } from './objects/OrganizationRoleCreateInput.schema';
import { OrganizationRoleUncheckedCreateInputObjectSchema as OrganizationRoleUncheckedCreateInputObjectSchema } from './objects/OrganizationRoleUncheckedCreateInput.schema';

export const OrganizationRoleCreateOneSchema: z.ZodType<Prisma.OrganizationRoleCreateArgs> = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), data: z.union([OrganizationRoleCreateInputObjectSchema, OrganizationRoleUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleCreateArgs>;

export const OrganizationRoleCreateOneZodSchema = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), data: z.union([OrganizationRoleCreateInputObjectSchema, OrganizationRoleUncheckedCreateInputObjectSchema]) }).strict();