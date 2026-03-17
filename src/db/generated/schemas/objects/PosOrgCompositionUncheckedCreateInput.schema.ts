import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUncheckedCreateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedCreateInput>;
export const PosOrgCompositionUncheckedCreateInputObjectZodSchema = makeSchema();
