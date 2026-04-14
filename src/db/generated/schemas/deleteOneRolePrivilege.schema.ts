import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';

export const RolePrivilegeDeleteOneSchema: z.ZodType<Prisma.RolePrivilegeDeleteArgs> = z.object({   where: RolePrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeDeleteArgs>;

export const RolePrivilegeDeleteOneZodSchema = z.object({   where: RolePrivilegeWhereUniqueInputObjectSchema }).strict();