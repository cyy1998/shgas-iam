import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutPositionInputObjectSchema as EmploymentCreateNestedManyWithoutPositionInputObjectSchema } from './EmploymentCreateNestedManyWithoutPositionInput.schema';
import { PositionRoleCreateNestedManyWithoutPositionInputObjectSchema as PositionRoleCreateNestedManyWithoutPositionInputObjectSchema } from './PositionRoleCreateNestedManyWithoutPositionInput.schema';
import { PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema as PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateNestedManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  posCode: z.string().max(64),
  posName: z.string().max(128),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleCreateNestedManyWithoutPositionInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionCreateNestedManyWithoutPositionInputObjectSchema).optional()
}).strict();
export const PositionCreateInputObjectSchema: z.ZodType<Prisma.PositionCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateInput>;
export const PositionCreateInputObjectZodSchema = makeSchema();
