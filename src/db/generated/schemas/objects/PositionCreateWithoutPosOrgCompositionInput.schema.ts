import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutPositionInputObjectSchema as EmploymentCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentCreateNestedManyWithoutPositionInput.schema';
import { PositionRoleCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionCreateWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionCreateWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateWithoutPosOrgCompositionInput>;
export const PositionCreateWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
