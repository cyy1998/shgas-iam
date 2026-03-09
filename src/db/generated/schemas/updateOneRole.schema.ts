import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './objects/RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleUpdateInputObjectSchema as RoleUpdateInputObjectSchema } from './objects/RoleUpdateInput.schema';
import { RoleUncheckedUpdateInputObjectSchema as RoleUncheckedUpdateInputObjectSchema } from './objects/RoleUncheckedUpdateInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';

export const RoleUpdateOneSchema: z.ZodType<Prisma.RoleUpdateArgs> = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), data: z.union([RoleUpdateInputObjectSchema, RoleUncheckedUpdateInputObjectSchema]), where: RoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleUpdateArgs>;

export const RoleUpdateOneZodSchema = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), data: z.union([RoleUpdateInputObjectSchema, RoleUncheckedUpdateInputObjectSchema]), where: RoleWhereUniqueInputObjectSchema }).strict();