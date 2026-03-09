import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleAvgOrderByAggregateInput>;
export const OrganizationRoleAvgOrderByAggregateInputObjectZodSchema = makeSchema();
