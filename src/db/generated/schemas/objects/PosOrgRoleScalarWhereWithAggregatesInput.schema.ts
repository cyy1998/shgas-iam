import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const posorgrolescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgRoleScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  posOrgId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PosOrgRoleScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.PosOrgRoleScalarWhereWithAggregatesInput> = posorgrolescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.PosOrgRoleScalarWhereWithAggregatesInput>;
export const PosOrgRoleScalarWhereWithAggregatesInputObjectZodSchema = posorgrolescalarwherewithaggregatesinputSchema;
