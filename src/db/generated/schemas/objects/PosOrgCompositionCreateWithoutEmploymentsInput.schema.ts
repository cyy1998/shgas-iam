import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  position: z.lazy(() => PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  organization: z.lazy(() => OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  roles: z.lazy(() => PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateWithoutEmploymentsInput>;
export const PosOrgCompositionCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
