import * as z from 'zod';
export const PrivilegeDelegationGroupByResultSchema = z.array(z.object({
  id: z.number().int(),
  delegatorUserId: z.number().int(),
  delegateeUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.date(),
  endTime: z.date(),
  status: z.number().int(),
  description: z.string(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  _count: z.object({
    id: z.number(),
    delegatorUserId: z.number(),
    delegateeUserId: z.number(),
    organizationScopeId: z.number(),
    startTime: z.number(),
    endTime: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    delegatorUser: z.number(),
    delegateeUser: z.number(),
    organizationScope: z.number(),
    delegationDetails: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    delegatorUserId: z.number().nullable(),
    delegateeUserId: z.number().nullable(),
    organizationScopeId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    delegatorUserId: z.number().nullable(),
    delegateeUserId: z.number().nullable(),
    organizationScopeId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    delegatorUserId: z.number().int().nullable(),
    delegateeUserId: z.number().int().nullable(),
    organizationScopeId: z.number().int().nullable(),
    startTime: z.date().nullable(),
    endTime: z.date().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    delegatorUserId: z.number().int().nullable(),
    delegateeUserId: z.number().int().nullable(),
    organizationScopeId: z.number().int().nullable(),
    startTime: z.date().nullable(),
    endTime: z.date().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()
}));