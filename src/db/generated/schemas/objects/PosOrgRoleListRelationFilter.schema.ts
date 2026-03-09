import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './PosOrgRoleWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => PosOrgRoleWhereInputObjectSchema).optional(),
  some: z.lazy(() => PosOrgRoleWhereInputObjectSchema).optional(),
  none: z.lazy(() => PosOrgRoleWhereInputObjectSchema).optional()
}).strict();
export const PosOrgRoleListRelationFilterObjectSchema: z.ZodType<Prisma.PosOrgRoleListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleListRelationFilter>;
export const PosOrgRoleListRelationFilterObjectZodSchema = makeSchema();
