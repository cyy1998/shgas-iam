import { z } from '@hono/zod-openapi';
export const DelegationDetailAggregateResultSchema = z.object({  _count: z.object({
    delegationId: z.number(),
    privilegeId: z.number(),
    delegation: z.number(),
    privilege: z.number()
  }).optional(),
  _sum: z.object({
    delegationId: z.number().nullable(),
    privilegeId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    delegationId: z.number().nullable(),
    privilegeId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    delegationId: z.number().int().nullable(),
    privilegeId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    delegationId: z.number().int().nullable(),
    privilegeId: z.number().int().nullable()
  }).nullable().optional()});