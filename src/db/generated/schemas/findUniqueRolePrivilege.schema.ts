import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';

export const RolePrivilegeFindUniqueSchema: z.ZodType<Prisma.RolePrivilegeFindUniqueArgs> = z.object({   where: RolePrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeFindUniqueArgs>;

export const RolePrivilegeFindUniqueZodSchema = z.object({   where: RolePrivilegeWhereUniqueInputObjectSchema }).strict();