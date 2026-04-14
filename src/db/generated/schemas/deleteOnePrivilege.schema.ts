import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';

export const PrivilegeDeleteOneSchema: z.ZodType<Prisma.PrivilegeDeleteArgs> = z.object({   where: PrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDeleteArgs>;

export const PrivilegeDeleteOneZodSchema = z.object({   where: PrivilegeWhereUniqueInputObjectSchema }).strict();