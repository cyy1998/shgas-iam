import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationUncheckedCreateInputObjectSchema as PrivilegeDelegationUncheckedCreateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedCreateInput.schema';

export const PrivilegeDelegationCreateOneSchema: z.ZodType<Prisma.PrivilegeDelegationCreateArgs> = z.object({   data: PrivilegeDelegationUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateArgs>;

export const PrivilegeDelegationCreateOneZodSchema = z.object({   data: PrivilegeDelegationUncheckedCreateInputObjectSchema }).strict();