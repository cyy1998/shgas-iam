import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCountOutputTypeCountRolesArgsObjectSchema as EmploymentCountOutputTypeCountRolesArgsObjectSchema } from './EmploymentCountOutputTypeCountRolesArgs.schema'

const makeSchema = () => z.object({
  roles: z.union([z.boolean(), z.lazy(() => EmploymentCountOutputTypeCountRolesArgsObjectSchema)]).optional()
}).strict();
export const EmploymentCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.EmploymentCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCountOutputTypeSelect>;
export const EmploymentCountOutputTypeSelectObjectZodSchema = makeSchema();
