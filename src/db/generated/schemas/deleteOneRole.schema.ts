import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './objects/RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';

export const RoleDeleteOneSchema: z.ZodType<Prisma.RoleDeleteArgs> = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleDeleteArgs>;

export const RoleDeleteOneZodSchema = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema }).strict();