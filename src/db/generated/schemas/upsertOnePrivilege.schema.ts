import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeSelectObjectSchema as PrivilegeSelectObjectSchema } from './objects/PrivilegeSelect.schema';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './objects/PrivilegeInclude.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';
import { PrivilegeCreateInputObjectSchema as PrivilegeCreateInputObjectSchema } from './objects/PrivilegeCreateInput.schema';
import { PrivilegeUncheckedCreateInputObjectSchema as PrivilegeUncheckedCreateInputObjectSchema } from './objects/PrivilegeUncheckedCreateInput.schema';
import { PrivilegeUpdateInputObjectSchema as PrivilegeUpdateInputObjectSchema } from './objects/PrivilegeUpdateInput.schema';
import { PrivilegeUncheckedUpdateInputObjectSchema as PrivilegeUncheckedUpdateInputObjectSchema } from './objects/PrivilegeUncheckedUpdateInput.schema';

export const PrivilegeUpsertOneSchema: z.ZodType<Prisma.PrivilegeUpsertArgs> = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), where: PrivilegeWhereUniqueInputObjectSchema, create: z.union([ PrivilegeCreateInputObjectSchema, PrivilegeUncheckedCreateInputObjectSchema ]), update: z.union([ PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PrivilegeUpsertArgs>;

export const PrivilegeUpsertOneZodSchema = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), where: PrivilegeWhereUniqueInputObjectSchema, create: z.union([ PrivilegeCreateInputObjectSchema, PrivilegeUncheckedCreateInputObjectSchema ]), update: z.union([ PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema ]) }).strict();