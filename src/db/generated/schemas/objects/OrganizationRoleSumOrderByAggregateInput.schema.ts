import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleSumOrderByAggregateInput>;
export const OrganizationRoleSumOrderByAggregateInputObjectZodSchema = makeSchema();
