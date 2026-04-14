import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleFindUniqueSchema: z.ZodType<Prisma.PosOrgRoleFindUniqueArgs> = z.object({   where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleFindUniqueArgs>;

export const PosOrgRoleFindUniqueZodSchema = z.object({   where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();