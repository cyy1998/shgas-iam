import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedCreateWithoutRolesInput>;
export const PosOrgCompositionUncheckedCreateWithoutRolesInputObjectZodSchema = makeSchema();
