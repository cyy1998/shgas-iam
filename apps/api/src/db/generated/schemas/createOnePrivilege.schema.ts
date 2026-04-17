import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeUncheckedCreateInputObjectSchema as PrivilegeUncheckedCreateInputObjectSchema } from './objects/PrivilegeUncheckedCreateInput.schema';

export const PrivilegeCreateOneSchema: z.ZodType<Prisma.PrivilegeCreateArgs> = z.object({   data: PrivilegeUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeCreateArgs>;

export const PrivilegeCreateOneZodSchema = z.object({   data: PrivilegeUncheckedCreateInputObjectSchema }).strict();