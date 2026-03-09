import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './OrganizationClosureWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereInputObjectSchema).optional()
}).strict();
export const OrganizationCountOutputTypeCountDescendantClosuresArgsObjectSchema = makeSchema();
export const OrganizationCountOutputTypeCountDescendantClosuresArgsObjectZodSchema = makeSchema();
