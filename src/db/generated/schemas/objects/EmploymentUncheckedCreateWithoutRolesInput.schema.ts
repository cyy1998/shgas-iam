import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  userId: z.number().int(),
  posId: z.number().int(),
  deptId: z.number().int(),
  compId: z.number().int(),
  isPrimary: z.boolean().optional(),
  status: z.number().int().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional().nullable(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const EmploymentUncheckedCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedCreateWithoutRolesInput>;
export const EmploymentUncheckedCreateWithoutRolesInputObjectZodSchema = makeSchema();
