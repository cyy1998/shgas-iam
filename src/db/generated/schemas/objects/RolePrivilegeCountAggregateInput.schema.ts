import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const RolePrivilegeCountAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCountAggregateInputType>;
export const RolePrivilegeCountAggregateInputObjectZodSchema = makeSchema();
