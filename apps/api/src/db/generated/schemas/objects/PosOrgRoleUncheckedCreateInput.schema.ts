import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PosOrgRoleUncheckedCreateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedCreateInput>;
export const PosOrgRoleUncheckedCreateInputObjectZodSchema = makeSchema();
