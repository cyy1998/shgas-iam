import * as z from 'zod';
export const PosOrgRoleAggregateResultSchema = z.object({  _count: z.object({
    posOrgId: z.number(),
    roleId: z.number(),
    posOrg: z.number(),
    role: z.number()
  }).optional(),
  _sum: z.object({
    posOrgId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    posOrgId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    posOrgId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    posOrgId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional()});