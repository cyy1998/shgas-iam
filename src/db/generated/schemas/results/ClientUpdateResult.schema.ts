import { z } from '@hono/zod-openapi';
export const ClientUpdateResultSchema = z.nullable(z.object({
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
}));