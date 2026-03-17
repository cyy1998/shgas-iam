import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  roles: z.lazy(() => PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedCreateWithoutEmploymentsInput>;
export const PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
