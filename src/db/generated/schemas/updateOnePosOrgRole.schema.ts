import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleUpdateInputObjectSchema as PosOrgRoleUpdateInputObjectSchema } from './objects/PosOrgRoleUpdateInput.schema';
import { PosOrgRoleUncheckedUpdateInputObjectSchema as PosOrgRoleUncheckedUpdateInputObjectSchema } from './objects/PosOrgRoleUncheckedUpdateInput.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleUpdateOneSchema: z.ZodType<Prisma.PosOrgRoleUpdateArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), data: z.union([PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema]), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateArgs>;

export const PosOrgRoleUpdateOneZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), data: z.union([PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema]), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();