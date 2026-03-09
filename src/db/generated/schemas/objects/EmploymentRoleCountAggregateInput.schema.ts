import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const EmploymentRoleCountAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCountAggregateInputType>;
export const EmploymentRoleCountAggregateInputObjectZodSchema = makeSchema();
