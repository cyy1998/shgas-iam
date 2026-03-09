import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const EmploymentRoleMinAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleMinAggregateInputType>;
export const EmploymentRoleMinAggregateInputObjectZodSchema = makeSchema();
