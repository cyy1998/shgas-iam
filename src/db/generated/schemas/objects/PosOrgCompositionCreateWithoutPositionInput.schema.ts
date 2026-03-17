import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema as EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema } from './EmploymentCreateNestedManyWithoutPosOrgInput.schema';
import { PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  organization: z.lazy(() => OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateWithoutPositionInput>;
export const PosOrgCompositionCreateWithoutPositionInputObjectZodSchema = makeSchema();
