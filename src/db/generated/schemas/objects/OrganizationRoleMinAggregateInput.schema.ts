import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  isAllSub: z.literal(true).optional()
}).strict();
export const OrganizationRoleMinAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleMinAggregateInputType>;
export const OrganizationRoleMinAggregateInputObjectZodSchema = makeSchema();
