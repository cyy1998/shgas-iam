import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleCreateInputObjectSchema as PosOrgRoleCreateInputObjectSchema } from './objects/PosOrgRoleCreateInput.schema';
import { PosOrgRoleUncheckedCreateInputObjectSchema as PosOrgRoleUncheckedCreateInputObjectSchema } from './objects/PosOrgRoleUncheckedCreateInput.schema';

export const PosOrgRoleCreateOneSchema: z.ZodType<Prisma.PosOrgRoleCreateArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), data: z.union([PosOrgRoleCreateInputObjectSchema, PosOrgRoleUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleCreateArgs>;

export const PosOrgRoleCreateOneZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), data: z.union([PosOrgRoleCreateInputObjectSchema, PosOrgRoleUncheckedCreateInputObjectSchema]) }).strict();