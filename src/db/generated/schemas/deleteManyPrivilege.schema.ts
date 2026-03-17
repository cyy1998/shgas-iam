import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './objects/PrivilegeWhereInput.schema';

export const PrivilegeDeleteManySchema: z.ZodType<Prisma.PrivilegeDeleteManyArgs> = z.object({ where: PrivilegeWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeDeleteManyArgs>;

export const PrivilegeDeleteManyZodSchema = z.object({ where: PrivilegeWhereInputObjectSchema.optional() }).strict();