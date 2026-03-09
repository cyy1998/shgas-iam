import { z } from '@hono/zod-openapi';
export const EmploymentUpdateResultSchema = z.nullable(z.object({
  id: z.number().int(),
  userId: z.number().int(),
  posId: z.number().int(),
  deptId: z.number().int(),
  compId: z.number().int(),
  isPrimary: z.boolean(),
  status: z.number().int(),
  startTime: z.date(),
  endTime: z.date().optional(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  user: z.unknown(),
  deptartment: z.unknown(),
  company: z.unknown(),
  position: z.unknown(),
  posOrg: z.unknown(),
  roles: z.array(z.unknown())
}));