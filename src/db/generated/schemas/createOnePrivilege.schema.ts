import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeSelectObjectSchema as PrivilegeSelectObjectSchema } from './objects/PrivilegeSelect.schema';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './objects/PrivilegeInclude.schema';
import { PrivilegeCreateInputObjectSchema as PrivilegeCreateInputObjectSchema } from './objects/PrivilegeCreateInput.schema';
import { PrivilegeUncheckedCreateInputObjectSchema as PrivilegeUncheckedCreateInputObjectSchema } from './objects/PrivilegeUncheckedCreateInput.schema';

export const PrivilegeCreateOneSchema: z.ZodType<Prisma.PrivilegeCreateArgs> = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), data: z.union([PrivilegeCreateInputObjectSchema, PrivilegeUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PrivilegeCreateArgs>;

export const PrivilegeCreateOneZodSchema = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), data: z.union([PrivilegeCreateInputObjectSchema, PrivilegeUncheckedCreateInputObjectSchema]) }).strict();