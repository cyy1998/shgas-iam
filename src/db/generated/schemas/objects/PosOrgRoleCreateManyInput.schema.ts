import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PosOrgRoleCreateManyInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyInput>;
export const PosOrgRoleCreateManyInputObjectZodSchema = makeSchema();
