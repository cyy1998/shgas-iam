import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const positionrolescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PositionRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionRoleScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => PositionRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  positionId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PositionRoleScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.PositionRoleScalarWhereWithAggregatesInput> = positionrolescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.PositionRoleScalarWhereWithAggregatesInput>;
export const PositionRoleScalarWhereWithAggregatesInputObjectZodSchema = positionrolescalarwherewithaggregatesinputSchema;
