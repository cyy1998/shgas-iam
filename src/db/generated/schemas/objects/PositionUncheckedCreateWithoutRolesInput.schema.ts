import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInput.schema'

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
  posOrgComposition: z.lazy(() => PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionUncheckedCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionUncheckedCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUncheckedCreateWithoutRolesInput>;
export const PositionUncheckedCreateWithoutRolesInputObjectZodSchema = makeSchema();
