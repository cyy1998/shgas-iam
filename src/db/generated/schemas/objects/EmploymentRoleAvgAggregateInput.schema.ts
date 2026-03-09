import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const EmploymentRoleAvgAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleAvgAggregateInputType>;
export const EmploymentRoleAvgAggregateInputObjectZodSchema = makeSchema();
