import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const EmploymentRoleMaxAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleMaxAggregateInputType>;
export const EmploymentRoleMaxAggregateInputObjectZodSchema = makeSchema();
