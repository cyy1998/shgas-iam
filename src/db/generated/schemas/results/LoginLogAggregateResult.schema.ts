import * as z from 'zod';
export const LoginLogAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    userId: z.number(),
    username: z.number(),
    name: z.number(),
    clientCode: z.number(),
    loginType: z.number(),
    loginTime: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    userId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    userId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    userId: z.number().int().nullable(),
    username: z.string().nullable(),
    name: z.string().nullable(),
    clientCode: z.string().nullable(),
    loginType: z.string().nullable(),
    loginTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    userId: z.number().int().nullable(),
    username: z.string().nullable(),
    name: z.string().nullable(),
    clientCode: z.string().nullable(),
    loginType: z.string().nullable(),
    loginTime: z.date().nullable()
  }).nullable().optional()});