import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';

export const PosOrgRoleDeleteOneSchema: z.ZodType<Prisma.PosOrgRoleDeleteArgs> = z.object({   where: PosOrgRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleDeleteArgs>;

export const PosOrgRoleDeleteOneZodSchema = z.object({   where: PosOrgRoleWhereUniqueInputObjectSchema }).strict();