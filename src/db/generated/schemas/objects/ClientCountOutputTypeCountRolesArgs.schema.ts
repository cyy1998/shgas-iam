import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const ClientCountOutputTypeCountRolesArgsObjectSchema = makeSchema();
export const ClientCountOutputTypeCountRolesArgsObjectZodSchema = makeSchema();
