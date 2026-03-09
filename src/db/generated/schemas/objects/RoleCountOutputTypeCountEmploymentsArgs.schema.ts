import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './EmploymentRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleWhereInputObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeCountEmploymentsArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeCountEmploymentsArgsObjectZodSchema = makeSchema();
