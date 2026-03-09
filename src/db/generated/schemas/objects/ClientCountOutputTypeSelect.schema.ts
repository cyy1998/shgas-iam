import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientCountOutputTypeCountRolesArgsObjectSchema as ClientCountOutputTypeCountRolesArgsObjectSchema } from './ClientCountOutputTypeCountRolesArgs.schema'

const makeSchema = () => z.object({
  roles: z.union([z.boolean(), z.lazy(() => ClientCountOutputTypeCountRolesArgsObjectSchema)]).optional()
}).strict();
export const ClientCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.ClientCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.ClientCountOutputTypeSelect>;
export const ClientCountOutputTypeSelectObjectZodSchema = makeSchema();
