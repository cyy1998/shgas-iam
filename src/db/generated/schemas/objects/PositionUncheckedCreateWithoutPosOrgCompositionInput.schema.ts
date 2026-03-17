import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posCode: z.string(),
  posName: z.string(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionUncheckedCreateWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUncheckedCreateWithoutPosOrgCompositionInput>;
export const PositionUncheckedCreateWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
