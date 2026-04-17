import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeUncheckedCreateInputObjectSchema as RolePrivilegeUncheckedCreateInputObjectSchema } from './objects/RolePrivilegeUncheckedCreateInput.schema';

export const RolePrivilegeCreateOneSchema: z.ZodType<Prisma.RolePrivilegeCreateArgs> = z.object({   data: RolePrivilegeUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeCreateArgs>;

export const RolePrivilegeCreateOneZodSchema = z.object({   data: RolePrivilegeUncheckedCreateInputObjectSchema }).strict();