import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const PosOrgRoleCreateManyPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateManyPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateManyPosOrgInput>;
export const PosOrgRoleCreateManyPosOrgInputObjectZodSchema = makeSchema();
