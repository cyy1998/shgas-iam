import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const organizationclosurescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationClosureScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationClosureScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationClosureScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  ancestorId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  descendantId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  depth: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const OrganizationClosureScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.OrganizationClosureScalarWhereWithAggregatesInput> = organizationclosurescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.OrganizationClosureScalarWhereWithAggregatesInput>;
export const OrganizationClosureScalarWhereWithAggregatesInputObjectZodSchema = organizationclosurescalarwherewithaggregatesinputSchema;
