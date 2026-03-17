import * as z from 'zod';
export const OrganizationClosureAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    ancestorId: z.number(),
    descendantId: z.number(),
    depth: z.number(),
    ancestor: z.number(),
    descendant: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    ancestorId: z.number().nullable(),
    descendantId: z.number().nullable(),
    depth: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    ancestorId: z.number().nullable(),
    descendantId: z.number().nullable(),
    depth: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    ancestorId: z.number().int().nullable(),
    descendantId: z.number().int().nullable(),
    depth: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    ancestorId: z.number().int().nullable(),
    descendantId: z.number().int().nullable(),
    depth: z.number().int().nullable()
  }).nullable().optional()});