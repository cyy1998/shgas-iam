import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema as EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema } from './EmploymentCreateNestedManyWithoutPosOrgInput.schema';
import { PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  position: z.lazy(() => PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateWithoutOrganizationInput>;
export const PosOrgCompositionCreateWithoutOrganizationInputObjectZodSchema = makeSchema();
