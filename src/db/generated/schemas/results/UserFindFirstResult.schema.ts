import { z } from '@hono/zod-openapi';
export const UserFindFirstResultSchema = z.nullable(z.object({
  id: z.number().int(),
  username: z.string(),
  wxId: z.string().optional(),
  name: z.string(),
  password: z.string().optional(),
  mobile: z.string().optional(),
  userType: z.string(),
  orderNum: z.number().int(),
  status: z.number().int(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  employments: z.array(z.unknown()),
  delegationTo: z.array(z.unknown()),
  delegationFrom: z.array(z.unknown())
}));