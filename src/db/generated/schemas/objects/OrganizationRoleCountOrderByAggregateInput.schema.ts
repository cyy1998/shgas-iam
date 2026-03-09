import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  isAllSub: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCountOrderByAggregateInput>;
export const OrganizationRoleCountOrderByAggregateInputObjectZodSchema = makeSchema();
