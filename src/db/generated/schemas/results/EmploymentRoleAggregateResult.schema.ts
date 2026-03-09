import { z } from '@hono/zod-openapi';
export const EmploymentRoleAggregateResultSchema = z.object({  _count: z.object({
    employmentId: z.number(),
    roleId: z.number(),
    employment: z.number(),
    role: z.number()
  }).optional(),
  _sum: z.object({
    employmentId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    employmentId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    employmentId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    employmentId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional()});