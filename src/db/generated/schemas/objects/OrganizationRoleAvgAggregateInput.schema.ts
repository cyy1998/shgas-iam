import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const OrganizationRoleAvgAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleAvgAggregateInputType>;
export const OrganizationRoleAvgAggregateInputObjectZodSchema = makeSchema();
