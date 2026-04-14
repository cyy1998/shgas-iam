import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';

export const RoleFindUniqueSchema: z.ZodType<Prisma.RoleFindUniqueArgs> = z.object({   where: RoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleFindUniqueArgs>;

export const RoleFindUniqueZodSchema = z.object({   where: RoleWhereUniqueInputObjectSchema }).strict();