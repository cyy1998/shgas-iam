import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeUpdateInputObjectSchema as PrivilegeUpdateInputObjectSchema } from './objects/PrivilegeUpdateInput.schema';
import { PrivilegeUncheckedUpdateInputObjectSchema as PrivilegeUncheckedUpdateInputObjectSchema } from './objects/PrivilegeUncheckedUpdateInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';

export const PrivilegeUpdateOneSchema: z.ZodType<Prisma.PrivilegeUpdateArgs> = z.object({   data: z.union([PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema]), where: PrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeUpdateArgs>;

export const PrivilegeUpdateOneZodSchema = z.object({   data: z.union([PrivilegeUpdateInputObjectSchema, PrivilegeUncheckedUpdateInputObjectSchema]), where: PrivilegeWhereUniqueInputObjectSchema }).strict();