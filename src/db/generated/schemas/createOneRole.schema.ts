import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleUncheckedCreateInputObjectSchema as RoleUncheckedCreateInputObjectSchema } from './objects/RoleUncheckedCreateInput.schema';

export const RoleCreateOneSchema: z.ZodType<Prisma.RoleCreateArgs> = z.object({   data: RoleUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleCreateArgs>;

export const RoleCreateOneZodSchema = z.object({   data: RoleUncheckedCreateInputObjectSchema }).strict();