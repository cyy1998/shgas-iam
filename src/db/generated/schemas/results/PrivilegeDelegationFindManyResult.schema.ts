import * as z from 'zod';
export const PrivilegeDelegationFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  delegatorUserId: z.number().int(),
  delegateeUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.date(),
  endTime: z.date(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  delegatorUser: z.unknown(),
  delegateeUser: z.unknown(),
  organizationScope: z.unknown(),
  delegationDetails: z.array(z.unknown())
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