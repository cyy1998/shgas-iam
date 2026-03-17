import * as z from 'zod';
export const PosOrgCompositionAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    posId: z.number(),
    orgId: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    position: z.number(),
    organization: z.number(),
    employments: z.number(),
    roles: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    posId: z.number().nullable(),
    orgId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    posId: z.number().nullable(),
    orgId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    posId: z.number().int().nullable(),
    orgId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    posId: z.number().int().nullable(),
    orgId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()});