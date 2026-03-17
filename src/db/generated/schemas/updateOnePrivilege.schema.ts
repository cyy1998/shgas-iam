import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeSelectObjectSchema as PrivilegeSelectObjectSchema } from './objects/PrivilegeSelect.schema';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './objects/PrivilegeInclude.schema';
import { PrivilegeUpdateInputObjectSchema as PrivilegeUpdateInputObjectSchema } from './objects/PrivilegeUpdateInput.schema';
import { PrivilegeUncheckedUpdateInputObjectSchema as PrivilegeUncheckedUpdateInputObjectSchema } from './objects/PrivilegeUncheckedUpdateInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';

export const PrivilegeUpdateOneSchema: z.ZodType<Prisma.PrivilegeUpdateArgs> = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), data: z.union([PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema]), where: PrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeUpdateArgs>;

export const PrivilegeUpdateOneZodSchema = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), data: z.union([PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema]), where: PrivilegeWhereUniqueInputObjectSchema }).strict();