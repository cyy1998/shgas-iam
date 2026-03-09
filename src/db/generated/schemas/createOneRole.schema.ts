import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './objects/RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleCreateInputObjectSchema as RoleCreateInputObjectSchema } from './objects/RoleCreateInput.schema';
import { RoleUncheckedCreateInputObjectSchema as RoleUncheckedCreateInputObjectSchema } from './objects/RoleUncheckedCreateInput.schema';

export const RoleCreateOneSchema: z.ZodType<Prisma.RoleCreateArgs> = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), data: z.union([RoleCreateInputObjectSchema, RoleUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.RoleCreateArgs>;

export const RoleCreateOneZodSchema = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), data: z.union([RoleCreateInputObjectSchema, RoleUncheckedCreateInputObjectSchema]) }).strict();