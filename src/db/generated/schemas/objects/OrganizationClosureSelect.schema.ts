import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  ancestorId: z.boolean().optional(),
  descendantId: z.boolean().optional(),
  depth: z.boolean().optional(),
  ancestor: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  descendant: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional()
}).strict();
export const OrganizationClosureSelectObjectSchema: z.ZodType<Prisma.OrganizationClosureSelect> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureSelect>;
export const OrganizationClosureSelectObjectZodSchema = makeSchema();
