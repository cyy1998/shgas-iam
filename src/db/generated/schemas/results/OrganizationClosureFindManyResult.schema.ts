import { z } from '@hono/zod-openapi';
export const OrganizationClosureFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  ancestorId: z.number().int(),
  descendantId: z.number().int(),
  depth: z.number().int(),
  ancestor: z.unknown(),
  descendant: z.unknown()
})),
  pagination: z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean()
})
});