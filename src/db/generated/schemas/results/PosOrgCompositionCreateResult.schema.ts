import { z } from '@hono/zod-openapi';
export const PosOrgCompositionCreateResultSchema = z.object({
  id: z.number().int(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  position: z.unknown(),
  organization: z.unknown(),
  employments: z.array(z.unknown()),
  roles: z.array(z.unknown())
});