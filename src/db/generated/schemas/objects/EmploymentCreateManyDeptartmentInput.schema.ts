import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  userId: z.number().int(),
  posId: z.number().int(),
  compId: z.number().int(),
  isPrimary: z.boolean().optional(),
  status: z.number().int().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const EmploymentCreateManyDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentCreateManyDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyDeptartmentInput>;
export const EmploymentCreateManyDeptartmentInputObjectZodSchema = makeSchema();
