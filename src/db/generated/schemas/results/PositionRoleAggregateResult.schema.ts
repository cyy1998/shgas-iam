import { z } from '@hono/zod-openapi';
export const PositionRoleAggregateResultSchema = z.object({  _count: z.object({
    positionId: z.number(),
    roleId: z.number(),
    position: z.number(),
    role: z.number()
  }).optional(),
  _sum: z.object({
    positionId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    positionId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    positionId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    positionId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional()});