import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleDeleteOneSchema: z.ZodType<Prisma.PosOrgRoleDeleteArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleDeleteArgs>;

export const PosOrgRoleDeleteOneZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();