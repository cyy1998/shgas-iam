import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const RolePrivilegeMinAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeMinAggregateInputType>;
export const RolePrivilegeMinAggregateInputObjectZodSchema = makeSchema();
