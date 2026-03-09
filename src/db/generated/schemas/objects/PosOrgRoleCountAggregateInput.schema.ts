import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const PosOrgRoleCountAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCountAggregateInputType>;
export const PosOrgRoleCountAggregateInputObjectZodSchema = makeSchema();
