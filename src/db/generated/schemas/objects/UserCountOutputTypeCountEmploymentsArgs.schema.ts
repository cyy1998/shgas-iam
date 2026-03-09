import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereInputObjectSchema).optional()
}).strict();
export const UserCountOutputTypeCountEmploymentsArgsObjectSchema = makeSchema();
export const UserCountOutputTypeCountEmploymentsArgsObjectZodSchema = makeSchema();
