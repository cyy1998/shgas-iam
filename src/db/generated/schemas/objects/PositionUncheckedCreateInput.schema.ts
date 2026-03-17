import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateNestedManyWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionUncheckedCreateInputObjectSchema: z.ZodType<Prisma.PositionUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUncheckedCreateInput>;
export const PositionUncheckedCreateInputObjectZodSchema = makeSchema();
