import * as z from 'zod';
export const OrganizationRoleGroupByResultSchema = z.array(z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean(),
  _count: z.object({
    organizationId: z.number(),
    roleId: z.number(),
    isAllSub: z.number(),
    organization: z.number(),
    role: z.number()
  }).optional(),
  _sum: z.object({
    organizationId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _avg: z.object({
    organizationId: z.number().nullable(),
    roleId: z.number().nullable()
  }).nullable().optional(),
  _min: z.object({
    organizationId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional(),
  _max: z.object({
    organizationId: z.number().int().nullable(),
    roleId: z.number().int().nullable()
  }).nullable().optional()
}));