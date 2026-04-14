import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';

export const PrivilegeFindUniqueSchema: z.ZodType<Prisma.PrivilegeFindUniqueArgs> = z.object({   where: PrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeFindUniqueArgs>;

export const PrivilegeFindUniqueZodSchema = z.object({   where: PrivilegeWhereUniqueInputObjectSchema }).strict();