import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { PositionOrderByWithRelationInputObjectSchema as PositionOrderByWithRelationInputObjectSchema } from './PositionOrderByWithRelationInput.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './RoleOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  positionId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  position: z.lazy(() => PositionOrderByWithRelationInputObjectSchema).optional(),
  role: z.lazy(() => RoleOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const PositionRoleOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PositionRoleOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleOrderByWithRelationInput>;
export const PositionRoleOrderByWithRelationInputObjectZodSchema = makeSchema();
