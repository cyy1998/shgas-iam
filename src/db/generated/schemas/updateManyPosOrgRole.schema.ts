import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleUpdateManyMutationInputObjectSchema as PosOrgRoleUpdateManyMutationInputObjectSchema } from './objects/PosOrgRoleUpdateManyMutationInput.schema';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './objects/PosOrgRoleWhereInput.schema';

export const PosOrgRoleUpdateManySchema: z.ZodType<Prisma.PosOrgRoleUpdateManyArgs> = z.object({ data: PosOrgRoleUpdateManyMutationInputObjectSchema, where: PosOrgRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyArgs>;

export const PosOrgRoleUpdateManyZodSchema = z.object({ data: PosOrgRoleUpdateManyMutationInputObjectSchema, where: PosOrgRoleWhereInputObjectSchema.optional() }).strict();