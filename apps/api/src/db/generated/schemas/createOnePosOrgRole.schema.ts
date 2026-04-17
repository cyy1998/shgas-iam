import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleUncheckedCreateInputObjectSchema as PosOrgRoleUncheckedCreateInputObjectSchema } from './objects/PosOrgRoleUncheckedCreateInput.schema';

export const PosOrgRoleCreateOneSchema: z.ZodType<Prisma.PosOrgRoleCreateArgs> = z.object({   data: PosOrgRoleUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleCreateArgs>;

export const PosOrgRoleCreateOneZodSchema = z.object({   data: PosOrgRoleUncheckedCreateInputObjectSchema }).strict();