import * as z from 'zod';
export const RoleAggregateResultSchema = z.object({  _count: z.object({
    id: z.number(),
    roleCode: z.number(),
    roleName: z.number(),
    clientId: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    client: z.number(),
    positions: z.number(),
    organizations: z.number(),
    positionOrganizations: z.number(),
    employments: z.number(),
    privileges: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    clientId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    clientId: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    roleCode: z.string().nullable(),
    roleName: z.string().nullable(),
    clientId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    roleCode: z.string().nullable(),
    roleName: z.string().nullable(),
    clientId: z.number().int().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()});