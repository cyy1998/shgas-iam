import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeUpdateInputObjectSchema as RolePrivilegeUpdateInputObjectSchema } from './objects/RolePrivilegeUpdateInput.schema';
import { RolePrivilegeUncheckedUpdateInputObjectSchema as RolePrivilegeUncheckedUpdateInputObjectSchema } from './objects/RolePrivilegeUncheckedUpdateInput.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';

export const RolePrivilegeUpdateOneSchema: z.ZodType<Prisma.RolePrivilegeUpdateArgs> = z.object({   data: z.union([RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema]), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateArgs>;

export const RolePrivilegeUpdateOneZodSchema = z.object({   data: z.union([RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema]), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict();