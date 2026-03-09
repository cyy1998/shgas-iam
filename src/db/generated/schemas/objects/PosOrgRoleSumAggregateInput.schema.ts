import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PosOrgRoleSumAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleSumAggregateInputType>;
export const PosOrgRoleSumAggregateInputObjectZodSchema = makeSchema();
