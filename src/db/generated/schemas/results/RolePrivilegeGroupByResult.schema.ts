import { z } from '@hono/zod-openapi';
export const RolePrivilegeGroupByResultSchema = z.array(z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int(),
  _count: z.object({
    roleId: z.number(),
    privilegeId: z.number(),
    role: z.number(),
    privilege: z.number()
  }).optional(),
  _sum: z.object({
    roleId: z.number().nullable(),
    privilegeId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    roleId: z.number().nullable(),
    privilegeId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    roleId: z.number().int().nullable(),
    privilegeId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    roleId: z.number().int().nullable(),
    privilegeId: z.number().int().nullable()
  }).nullable().optional()
}));