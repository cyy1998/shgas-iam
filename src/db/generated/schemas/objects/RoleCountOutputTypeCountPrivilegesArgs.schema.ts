import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './RolePrivilegeWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereInputObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeCountPrivilegesArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeCountPrivilegesArgsObjectZodSchema = makeSchema();
