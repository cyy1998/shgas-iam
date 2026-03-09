import { z } from '@hono/zod-openapi';
export const OrganizationClosureDeleteResultSchema = z.nullable(z.object({
  id: z.number().int(),
  ancestorId: z.number().int(),
  descendantId: z.number().int(),
  depth: z.number().int(),
  ancestor: z.unknown(),
  descendant: z.unknown()
}));