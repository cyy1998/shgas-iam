import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int()
}).strict();
export const PosOrgRoleCreateManyRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateManyRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyRoleInput>;
export const PosOrgRoleCreateManyRoleInputObjectZodSchema = makeSchema();
