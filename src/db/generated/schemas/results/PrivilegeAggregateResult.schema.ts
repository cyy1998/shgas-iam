import * as z from 'zod';
export const PrivilegeAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    privilegeCode: z.number(),
    privilegeName: z.number(),
    fieldValues: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    roles: z.number(),
    delegations: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    privilegeCode: z.string().nullable(),
    privilegeName: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    privilegeCode: z.string().nullable(),
    privilegeName: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()});