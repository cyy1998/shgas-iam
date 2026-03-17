import * as z from 'zod';
export const PositionFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  posCode: z.string(),
  posName: z.string(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  employments: z.array(z.unknown()),
  roles: z.array(z.unknown()),
  posOrgComposition: z.array(z.unknown())
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