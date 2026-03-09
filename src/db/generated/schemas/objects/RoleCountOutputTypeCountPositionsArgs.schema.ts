import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './PositionRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereInputObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeCountPositionsArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeCountPositionsArgsObjectZodSchema = makeSchema();
