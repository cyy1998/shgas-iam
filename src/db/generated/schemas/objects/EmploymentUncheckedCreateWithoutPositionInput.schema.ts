import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  userId: z.number().int(),
  deptId: z.number().int(),
  compId: z.number().int(),
  isPrimary: z.boolean().optional(),
  status: z.number().int().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional().nullable(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  roles: z.lazy(() => EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInputObjectSchema).optional()
}).strict();
export const EmploymentUncheckedCreateWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedCreateWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedCreateWithoutPositionInput>;
export const EmploymentUncheckedCreateWithoutPositionInputObjectZodSchema = makeSchema();
