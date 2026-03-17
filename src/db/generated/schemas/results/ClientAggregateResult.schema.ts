import * as z from 'zod';
export const ClientAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    clientCode: z.number(),
    clientName: z.number(),
    url: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    extAttributes: z.number(),
    roles: z.number()
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
    clientCode: z.string().nullable(),
    clientName: z.string().nullable(),
    url: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    clientCode: z.string().nullable(),
    clientName: z.string().nullable(),
    url: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()});