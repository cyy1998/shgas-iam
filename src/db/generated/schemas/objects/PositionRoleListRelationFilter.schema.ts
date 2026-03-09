import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './PositionRoleWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => PositionRoleWhereInputObjectSchema).optional(),
  some: z.lazy(() => PositionRoleWhereInputObjectSchema).optional(),
  none: z.lazy(() => PositionRoleWhereInputObjectSchema).optional()
}).strict();
export const PositionRoleListRelationFilterObjectSchema: z.ZodType<Prisma.PositionRoleListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleListRelationFilter>;
export const PositionRoleListRelationFilterObjectZodSchema = makeSchema();
