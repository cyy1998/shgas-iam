import { z } from '@hono/zod-openapi';
export const DelegationDetailFindManyResultSchema = z.object({
  data: z.array(z.object({
  delegationId: z.number().int(),
  privilegeId: z.number().int(),
  delegation: z.unknown(),
  privilege: z.unknown()
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