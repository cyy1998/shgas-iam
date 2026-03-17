import * as z from 'zod';
export const EmploymentAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    userId: z.number(),
    posId: z.number(),
    orgId: z.number(),
    compId: z.number(),
    isPrimary: z.number(),
    status: z.number(),
    startTime: z.number(),
    endTime: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    user: z.number(),
    deptartment: z.number(),
    company: z.number(),
    position: z.number(),
    posOrg: z.number(),
    roles: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    userId: z.number().nullable(),
    posId: z.number().nullable(),
    orgId: z.number().nullable(),
    compId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    userId: z.number().nullable(),
    posId: z.number().nullable(),
    orgId: z.number().nullable(),
    compId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    userId: z.number().int().nullable(),
    posId: z.number().int().nullable(),
    orgId: z.number().int().nullable(),
    compId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    startTime: z.date().nullable(),
    endTime: z.date().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    userId: z.number().int().nullable(),
    posId: z.number().int().nullable(),
    orgId: z.number().int().nullable(),
    compId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    startTime: z.date().nullable(),
    endTime: z.date().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()});