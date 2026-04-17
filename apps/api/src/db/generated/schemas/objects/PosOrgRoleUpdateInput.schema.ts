import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PosOrgRoleUpdateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateInput>;
export const PosOrgRoleUpdateInputObjectZodSchema = makeSchema();
