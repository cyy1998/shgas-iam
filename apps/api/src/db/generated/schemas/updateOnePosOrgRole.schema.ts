import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleUpdateInputObjectSchema as PosOrgRoleUpdateInputObjectSchema } from './objects/PosOrgRoleUpdateInput.schema';
import { PosOrgRoleUncheckedUpdateInputObjectSchema as PosOrgRoleUncheckedUpdateInputObjectSchema } from './objects/PosOrgRoleUncheckedUpdateInput.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleUpdateOneSchema: z.ZodType<Prisma.PosOrgRoleUpdateArgs> = z.object({   data: z.union([PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema]), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateArgs>;

export const PosOrgRoleUpdateOneZodSchema = z.object({   data: z.union([PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema]), where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();