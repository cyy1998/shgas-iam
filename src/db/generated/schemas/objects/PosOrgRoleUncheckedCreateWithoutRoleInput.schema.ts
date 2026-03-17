import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int()
}).strict();
export const PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedCreateWithoutRoleInput>;
export const PosOrgRoleUncheckedCreateWithoutRoleInputObjectZodSchema = makeSchema();
