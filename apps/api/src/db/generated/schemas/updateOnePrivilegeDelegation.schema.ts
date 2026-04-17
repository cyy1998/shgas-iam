import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationUpdateInputObjectSchema as PrivilegeDelegationUpdateInputObjectSchema } from './objects/PrivilegeDelegationUpdateInput.schema';
import { PrivilegeDelegationUncheckedUpdateInputObjectSchema as PrivilegeDelegationUncheckedUpdateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedUpdateInput.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationUpdateOneSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateArgs> = z.object({   data: z.union([PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema]), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateArgs>;

export const PrivilegeDelegationUpdateOneZodSchema = z.object({   data: z.union([PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema]), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();