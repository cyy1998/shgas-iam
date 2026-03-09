import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PosOrgRoleMaxAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleMaxAggregateInputType>;
export const PosOrgRoleMaxAggregateInputObjectZodSchema = makeSchema();
