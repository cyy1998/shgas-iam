import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateNestedOneWithoutPosOrgCompositionInput.schema';
import { EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema as EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema } from './EmploymentCreateNestedManyWithoutPosOrgInput.schema';
import { PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema as PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateNestedManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  position: z.lazy(() => PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  organization: z.lazy(() => OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPosOrgInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateInput>;
export const PosOrgCompositionCreateInputObjectZodSchema = makeSchema();
