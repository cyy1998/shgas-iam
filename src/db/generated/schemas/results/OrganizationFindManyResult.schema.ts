import * as z from 'zod';
export const OrganizationFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  orgCode: z.string(),
  orgName: z.string(),
  parentId: z.number().int().optional(),
  businessParentId: z.number().int(),
  path: z.string(),
  level: z.number().int(),
  orgType: z.string(),
  orderNum: z.number().int(),
  isVirtual: z.boolean(),
  isEntity: z.boolean(),
  status: z.number().int(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  deptEmployments: z.array(z.unknown()),
  compEmployments: z.array(z.unknown()),
  roles: z.array(z.unknown()),
  posOrgComposition: z.array(z.unknown()),
  parent: z.unknown().optional(),
  children: z.array(z.unknown()),
  ancestorClosures: z.array(z.unknown()),
  descendantClosures: z.array(z.unknown()),
  privilegeDelegations: z.array(z.unknown())
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