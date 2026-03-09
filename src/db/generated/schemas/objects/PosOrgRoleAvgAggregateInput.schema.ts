import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PosOrgRoleAvgAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleAvgAggregateInputType>;
export const PosOrgRoleAvgAggregateInputObjectZodSchema = makeSchema();
