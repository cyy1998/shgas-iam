import { z } from '@hono/zod-openapi';
export const OrganizationRoleFindManyResultSchema = z.object({
  data: z.array(z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean(),
  organization: z.unknown(),
  role: z.unknown()
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