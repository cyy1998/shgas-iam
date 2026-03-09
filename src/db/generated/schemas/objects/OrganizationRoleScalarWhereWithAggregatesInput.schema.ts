import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema';
import { BoolWithAggregatesFilterObjectSchema as BoolWithAggregatesFilterObjectSchema } from './BoolWithAggregatesFilter.schema'

const organizationrolescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationRoleScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  organizationId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  isAllSub: z.union([z.lazy(() => BoolWithAggregatesFilterObjectSchema), z.boolean()]).optional()
}).strict();
export const OrganizationRoleScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.OrganizationRoleScalarWhereWithAggregatesInput> = organizationrolescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.OrganizationRoleScalarWhereWithAggregatesInput>;
export const OrganizationRoleScalarWhereWithAggregatesInputObjectZodSchema = organizationrolescalarwherewithaggregatesinputSchema;
