import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { PosOrgCompositionOrderByWithRelationInputObjectSchema as PosOrgCompositionOrderByWithRelationInputObjectSchema } from './PosOrgCompositionOrderByWithRelationInput.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './RoleOrderByWithRelationInput.schema'

const makeSchema = () => z.object({
  posOrgId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  posOrg: z.lazy(() => PosOrgCompositionOrderByWithRelationInputObjectSchema).optional(),
  role: z.lazy(() => RoleOrderByWithRelationInputObjectSchema).optional()
}).strict();
export const PosOrgRoleOrderByWithRelationInputObjectSchema: z.ZodType<Prisma.PosOrgRoleOrderByWithRelationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleOrderByWithRelationInput>;
export const PosOrgRoleOrderByWithRelationInputObjectZodSchema = makeSchema();
