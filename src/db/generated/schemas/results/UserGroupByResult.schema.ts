import * as z from 'zod';
export const UserGroupByResultSchema = z.array(z.object({
  id: z.number().int(),
  username: z.string(),
  wxId: z.string(),
  name: z.string(),
  password: z.string(),
  mobile: z.string(),
  userType: z.string(),
  orderNum: z.number().int(),
  status: z.number().int(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  _count: z.object({
    id: z.number(),
    username: z.number(),
    wxId: z.number(),
    name: z.number(),
    password: z.number(),
    mobile: z.number(),
    userType: z.number(),
    orderNum: z.number(),
    status: z.number(),
    isDelete: z.number(),
    createTime: z.number(),
    updateTime: z.number(),
    employments: z.number(),
    delegationTo: z.number(),
    delegationFrom: z.number()
  }).optional(),
  _sum: z.object({
    id: z.number().nullable(),
    orderNum: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    id: z.number().nullable(),
    orderNum: z.number().nullable(),
    status: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    id: z.number().int().nullable(),
    username: z.string().nullable(),
    wxId: z.string().nullable(),
    name: z.string().nullable(),
    password: z.string().nullable(),
    mobile: z.string().nullable(),
    userType: z.string().nullable(),
    orderNum: z.number().int().nullable(),
    status: z.number().int().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional(),
  _max: z.object({
    id: z.number().int().nullable(),
    username: z.string().nullable(),
    wxId: z.string().nullable(),
    name: z.string().nullable(),
    password: z.string().nullable(),
    mobile: z.string().nullable(),
    userType: z.string().nullable(),
    orderNum: z.number().int().nullable(),
    status: z.number().int().nullable(),
    createTime: z.date().nullable(),
    updateTime: z.date().nullable()
  }).nullable().optional()
}));