import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutPositionInputObjectSchema as EmploymentCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentCreateNestedManyWithoutPositionInput.schema';
import { PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema as PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateWithoutRolesInput>;
export const PositionCreateWithoutRolesInputObjectZodSchema = makeSchema();
