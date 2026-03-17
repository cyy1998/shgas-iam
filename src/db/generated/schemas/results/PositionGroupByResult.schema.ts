import * as z from 'zod';
export const PositionGroupByResultSchema = z.array(z.object({
  id: z.number().int(),
  posCode: z.string(),
  posName: z.string(),
  status: z.number().int(),
  description: z.string(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  _count: z.object({
    id: z.number(),
    posCode: z.number(),
    posName: z.number(),
    status: z.number(),
    description: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    employments: z.number(),
    roles: z.number(),
    posOrgComposition: z.number()
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
    posCode: z.string().nullable(),
    posName: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    posCode: z.string().nullable(),
    posName: z.string().nullable(),
    status: z.number().int().nullable(),
    description: z.string().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()
}));