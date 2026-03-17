import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeUpdateManyMutationInputObjectSchema as PrivilegeUpdateManyMutationInputObjectSchema } from './objects/PrivilegeUpdateManyMutationInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './objects/PrivilegeWhereInput.schema';

export const PrivilegeUpdateManySchema: z.ZodType<Prisma.PrivilegeUpdateManyArgs> = z.object({ data: PrivilegeUpdateManyMutationInputObjectSchema, where: PrivilegeWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeUpdateManyArgs>;

export const PrivilegeUpdateManyZodSchema = z.object({ data: PrivilegeUpdateManyMutationInputObjectSchema, where: PrivilegeWhereInputObjectSchema.optional() }).strict();