import * as z from 'zod';
export const UserFindManyResultSchema = z.object({
  data: z.array(z.object({
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