import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './objects/RolePrivilegeWhereInput.schema';

export const RolePrivilegeDeleteManySchema: z.ZodType<Prisma.RolePrivilegeDeleteManyArgs> = z.object({ where: RolePrivilegeWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeDeleteManyArgs>;

export const RolePrivilegeDeleteManyZodSchema = z.object({ where: RolePrivilegeWhereInputObjectSchema.optional() }).strict();