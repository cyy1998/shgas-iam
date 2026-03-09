import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './OrganizationOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  ancestorId: SortOrderSchema.optional(),
  descendantId: SortOrderSchema.optional(),
  depth: SortOrderSchema.optional(),
  ancestor: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional(),
  descendant: z.lazy(() => OrganizationOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const OrganizationClosureOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.OrganizationClosureOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureOrderByWithRelationInput>;
export const OrganizationClosureOrderByWithRelationInputObjectZodSchema = makeSchema();
