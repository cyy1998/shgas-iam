import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeUpdateManyMutationInputObjectSchema as RolePrivilegeUpdateManyMutationInputObjectSchema } from './objects/RolePrivilegeUpdateManyMutationInput.schema';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './objects/RolePrivilegeWhereInput.schema';

export const RolePrivilegeUpdateManySchema: z.ZodType<Prisma.RolePrivilegeUpdateManyArgs> = z.object({ data: RolePrivilegeUpdateManyMutationInputObjectSchema, where: RolePrivilegeWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateManyArgs>;

export const RolePrivilegeUpdateManyZodSchema = z.object({ data: RolePrivilegeUpdateManyMutationInputObjectSchema, where: RolePrivilegeWhereInputObjectSchema.optional() }).strict();