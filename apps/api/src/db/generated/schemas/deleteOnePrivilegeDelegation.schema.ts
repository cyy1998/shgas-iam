import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationDeleteOneSchema: z.ZodType<Prisma.PrivilegeDelegationDeleteArgs> = z.object({   where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationDeleteArgs>;

export const PrivilegeDelegationDeleteOneZodSchema = z.object({   where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();