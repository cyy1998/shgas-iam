import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './PosOrgRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCountOutputTypeCountRolesArgsObjectSchema = makeSchema();
export const PosOrgCompositionCountOutputTypeCountRolesArgsObjectZodSchema = makeSchema();
