import { z } from '@hono/zod-openapi';
export const ClientFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  clientCode: z.string(),
  clientName: z.string(),
  url: z.string().optional(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  extAttributes: z.unknown(),
  roles: z.array(z.unknown())
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