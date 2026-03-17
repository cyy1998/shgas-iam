import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleCreateNestedManyWithoutPositionInput.schema';
import { PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema as PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  roles: z.lazy(() => PositionRoleCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateWithoutEmploymentsInput>;
export const PositionCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
