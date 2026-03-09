import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateNestedManyWithoutPositionInput.schema';
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
  roles: z.lazy(() => PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionUncheckedCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionUncheckedCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUncheckedCreateWithoutEmploymentsInput>;
export const PositionUncheckedCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
