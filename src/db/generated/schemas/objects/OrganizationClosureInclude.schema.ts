import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema'

const makeSchema = () => z.object({
  ancestor: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  descendant: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional()
}).strict();
export const OrganizationClosureIncludeObjectSchema: z.ZodType<Prisma.OrganizationClosureInclude> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureInclude>;
export const OrganizationClosureIncludeObjectZodSchema = makeSchema();
