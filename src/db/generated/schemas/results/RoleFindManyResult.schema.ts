import * as z from 'zod';
export const RoleFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  roleCode: z.string(),
  roleName: z.string(),
  clientId: z.number().int(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  client: z.unknown(),
  positions: z.array(z.unknown()),
  organizations: z.array(z.unknown()),
  positionOrganizations: z.array(z.unknown()),
  employments: z.array(z.unknown()),
  privileges: z.array(z.unknown())
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