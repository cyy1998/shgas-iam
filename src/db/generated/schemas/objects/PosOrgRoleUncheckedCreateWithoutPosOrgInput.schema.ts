import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedCreateWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedCreateWithoutPosOrgInput>;
export const PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectZodSchema = makeSchema();
