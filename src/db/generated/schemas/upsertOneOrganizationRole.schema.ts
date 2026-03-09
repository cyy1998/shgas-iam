import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './objects/OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './objects/OrganizationRoleInclude.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleCreateInputObjectSchema as OrganizationRoleCreateInputObjectSchema } from './objects/OrganizationRoleCreateInput.schema';
import { OrganizationRoleUncheckedCreateInputObjectSchema as OrganizationRoleUncheckedCreateInputObjectSchema } from './objects/OrganizationRoleUncheckedCreateInput.schema';
import { OrganizationRoleUpdateInputObjectSchema as OrganizationRoleUpdateInputObjectSchema } from './objects/OrganizationRoleUpdateInput.schema';
import { OrganizationRoleUncheckedUpdateInputObjectSchema as OrganizationRoleUncheckedUpdateInputObjectSchema } from './objects/OrganizationRoleUncheckedUpdateInput.schema';

export const OrganizationRoleUpsertOneSchema: z.ZodType<Prisma.OrganizationRoleUpsertArgs> = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema, create: z.union([ OrganizationRoleCreateInputObjectSchema, OrganizationRoleUncheckedCreateInputObjectSchema ]), update: z.union([ OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleUpsertArgs>;

export const OrganizationRoleUpsertOneZodSchema = z.object({ select: OrganizationRoleSelectObjectSchema.optional(), include: OrganizationRoleIncludeObjectSchema.optional(), where: OrganizationRoleWhereUniqueInputObjectSchema, create: z.union([ OrganizationRoleCreateInputObjectSchema, OrganizationRoleUncheckedCreateInputObjectSchema ]), update: z.union([ OrganizationRoleUpdateInputObjectSchema, OrganizationRoleUncheckedUpdateInputObjectSchema ]) }).strict();