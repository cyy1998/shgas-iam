import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { PosOrgCompositionScalarRelationFilterObjectSchema as PosOrgCompositionScalarRelationFilterObjectSchema } from './PosOrgCompositionScalarRelationFilter.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema';
import { RoleScalarRelationFilterObjectSchema as RoleScalarRelationFilterObjectSchema } from './RoleScalarRelationFilter.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const posorgrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PosOrgRoleWhereInputObjectSchema), z.lazy(() => PosOrgRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PosOrgRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PosOrgRoleWhereInputObjectSchema), z.lazy(() => PosOrgRoleWhereInputObjectSchema).array()]).optional(),
  posOrgId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  posOrg: z.union([z.lazy(() => PosOrgCompositionScalarRelationFilterObjectSchema), z.lazy(() => PosOrgCompositionWhereInputObjectSchema)]).optional(),
  role: z.union([z.lazy(() => RoleScalarRelationFilterObjectSchema), z.lazy(() => RoleWhereInputObjectSchema)]).optional()
}).strict();
export const PosOrgRoleWhereInputObjectSchema: z.ZodType<Prisma.PosOrgRoleWhereInput> = posorgrolewhereinputSchema as unknown as z.ZodType<Prisma.PosOrgRoleWhereInput>;
export const PosOrgRoleWhereInputObjectZodSchema = posorgrolewhereinputSchema;
