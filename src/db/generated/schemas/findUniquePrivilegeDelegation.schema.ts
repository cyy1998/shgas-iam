import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationFindUniqueSchema: z.ZodType<Prisma.PrivilegeDelegationFindUniqueArgs> = z.object({   where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationFindUniqueArgs>;

export const PrivilegeDelegationFindUniqueZodSchema = z.object({   where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();